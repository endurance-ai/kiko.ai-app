"""brand_nodes 메타 자동 채우기 (LLM 추론).

흐름:
  1. style_node/sensitivity_tags/brand_keywords/attributes 모두 비어있는 brand 로드
  2. products 에서 SKU sample 10개 + 색상 top5 수집
  3. gpt-4o-mini (LiteLLM proxy) 에게 controlled vocab 중 선택 요청
  4. confidence 분기:
     - >= 0.85 : sensitivity_tags / brand_keywords 는 brand_nodes 직접 UPDATE
                 vibe/palette/material 는 brand_attribute_proposals (status='auto_applied') + brand_nodes.attributes 머지
     - 0.70~0.85 : brand_attribute_proposals (status='pending') 만 (검수큐)
     - < 0.70 : brand_attribute_proposals (status='rejected') (anti-pattern 학습용)

사용:
  cd ../ai
  uv run python /Users/hansangho/Desktop/kikoai/app/scripts/fill_brand_meta.py --limit 30
  uv run python /Users/hansangho/Desktop/kikoai/app/scripts/fill_brand_meta.py        # 풀배치
  uv run python /Users/hansangho/Desktop/kikoai/app/scripts/fill_brand_meta.py --dry-run --limit 5
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent.parent.parent / "ai"
sys.path.insert(0, str(AI_ROOT))

# .env 자동 로드
from dotenv import load_dotenv  # type: ignore
load_dotenv(AI_ROOT / ".env")

from app.core.config import settings  # noqa: E402
from supabase import create_client  # noqa: E402
from openai import OpenAI  # type: ignore  # noqa: E402

# ─── Controlled vocab ──────────────────────────────────────────
PALETTE = ["BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN", "GREEN",
           "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM", "KHAKI", "MULTI"]

SENSITIVITY = [
    "minimalist-architectural", "minimalist-relaxed", "minimalist-utilitarian",
    "contemporary-edgy", "contemporary-classic", "contemporary-quiet",
    "classic-traditional", "classic-modern",
    "vintage-romantic", "vintage-workwear",
    "chic-edgy", "chic-feminine",
    "casual-relaxed", "casual-sporty",
    "luxury-quiet", "luxury-bold",
    "avantgarde-deconstructed", "avantgarde-experimental",
    "feminine-romantic", "feminine-soft",
    "streetwear-skate", "streetwear-hype",
]

VIBE = [
    "archival", "quiet-luxury", "minimalist-architectural", "contemporary-basic",
    "avant-garde", "deconstructed-experimental", "workwear-revival",
    "preppy-classic", "streetwear", "americana",
    "y2k", "balletcore", "coquette", "mob-wife", "indie-sleaze",
    "dark-academia", "cottagecore", "normcore", "old-money", "techwear",
    "gorpcore", "outdoor", "athletic", "military", "utilitarian",
    "japanese-minimalist", "japanese-avant-garde", "scandinavian",
    "parisian-chic", "british-heritage",
]

MATERIAL = [
    "cotton", "denim", "jersey",
    "wool", "cashmere", "mohair",
    "polyester", "nylon", "acrylic",
    "silk", "satin",
    "leather", "suede",
    "knit", "fleece",
    "linen",
    "gore-tex", "technical-shell",
    "sweatshirt", "tweed",
]

AUTO_MERGE = 0.85
REVIEW_FLOOR = 0.70

SYSTEM_PROMPT = f"""You are a fashion brand metadata classifier.

Task: Given a brand name and SKU samples, classify it using ONLY the controlled vocabularies below. Output STRICT JSON.

PALETTE (pick 1-3): {PALETTE}
SENSITIVITY_TAGS (pick 1-3): {SENSITIVITY}
VIBE (pick 1-2): {VIBE}
MATERIAL (pick 1-3): {MATERIAL}

Rules:
- Use ONLY values from the lists above. No free invention.
- brand_keywords: 2-5 short Korean keywords describing the brand (free text, your judgment).
- confidence: your honest 0.00~1.00 self-assessment. If signals are weak (few SKUs, only basic items, you don't recognize the brand) → confidence < 0.70.
- rationale: 1 sentence in Korean explaining your reasoning.

Output JSON schema:
{{
  "palette": ["..."],
  "sensitivity_tags": ["..."],
  "vibe": ["..."],
  "material": ["..."],
  "brand_keywords": ["..."],
  "confidence": 0.00,
  "rationale": "..."
}}
"""


def load_target_brands(sb, limit=None):
    """메타 거의 다 비어있는 brand_nodes 로드."""
    out = []
    off = 0
    while True:
        chunk = (sb.table("brand_nodes")
                 .select("id, brand_name, style_node, sensitivity_tags, "
                         "brand_keywords, attributes, category_type")
                 .range(off, off + 999).execute().data)
        if not chunk:
            break
        for b in chunk:
            attrs = b.get("attributes") or {}
            empty = (not b.get("style_node")
                     and not b.get("sensitivity_tags")
                     and not b.get("brand_keywords")
                     and not attrs)
            if empty:
                out.append(b)
        if len(chunk) < 1000:
            break
        off += 1000
    out.sort(key=lambda b: b["brand_name"])
    return out[:limit] if limit else out


def gather_signals(sb, brand_name, n=10):
    """products 에서 sample + 색상 분포."""
    product_data = (sb.table("products")
                    .select("id, name, category, subcategory")
                    .eq("brand", brand_name)
                    .limit(1000)
                    .execute().data)

    color_by_product_id = {}
    product_ids = [p["id"] for p in product_data]
    for start in range(0, len(product_ids), 200):
        feature_data = (sb.table("product_features")
                        .select("product_id, feature_metadata")
                        .in_("product_id", product_ids[start:start + 200])
                        .execute().data)
        for row in feature_data:
            metadata = row.get("feature_metadata") or {}
            color = metadata.get("primary_color")
            if color:
                color_by_product_id[row["product_id"]] = color

    colors = Counter(color_by_product_id.values())
    cats = Counter(p["category"] for p in product_data if p.get("category"))
    samples = [
        {**p, "color": color_by_product_id.get(p["id"])}
        for p in product_data[:n]
    ]

    n_total = (sb.table("products").select("id", count="exact", head=True)
               .eq("brand", brand_name).execute().count)

    return {
        "n_products": n_total,
        "samples": samples,
        "color_top5": colors.most_common(5),
        "category_dist": cats.most_common(5),
    }


def build_user_message(brand_name, signals):
    lines = [f"브랜드: {brand_name}", f"DB SKU 수: {signals['n_products']}"]
    if signals["color_top5"]:
        cs = ", ".join(f"{c}({n})" for c, n in signals["color_top5"])
        lines.append(f"색상 top5: {cs}")
    if signals["category_dist"]:
        cs = ", ".join(f"{c}({n})" for c, n in signals["category_dist"])
        lines.append(f"카테고리 분포: {cs}")
    if signals["samples"]:
        lines.append("\n상품명 샘플:")
        for p in signals["samples"]:
            nm = p.get("name") or "?"
            cl = p.get("color") or ""
            cat = p.get("category") or ""
            lines.append(f"  - [{cat}/{cl}] {nm}")
    return "\n".join(lines)


def call_llm(client, model, brand_name, user_msg):
    resp = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
    )
    raw = resp.choices[0].message.content
    return json.loads(raw)


def sanitize(out):
    """LLM 출력에서 vocab 외 값 제거."""
    out["palette"] = [v for v in out.get("palette", []) if v in PALETTE][:3]
    out["sensitivity_tags"] = [v for v in out.get("sensitivity_tags", []) if v in SENSITIVITY][:3]
    out["vibe"] = [v for v in out.get("vibe", []) if v in VIBE][:2]
    out["material"] = [v for v in out.get("material", []) if v in MATERIAL][:3]
    kws = out.get("brand_keywords", [])
    out["brand_keywords"] = [str(k) for k in kws][:5] if isinstance(kws, list) else []
    try:
        out["confidence"] = max(0.0, min(1.0, float(out.get("confidence", 0))))
    except (ValueError, TypeError):
        out["confidence"] = 0.0
    out["rationale"] = str(out.get("rationale", ""))[:500]
    return out


def apply_to_db(sb, brand, parsed, dry_run=False):
    bid = brand["id"]
    conf = parsed["confidence"]

    # 1. attribute proposals (vibe/palette/material).
    # 같은 (brand_id, field) 가 이미 pending/approved/auto_applied 상태로
    # 존재하면 skip — 재실행 시 중복 누적 방지. rejected 만 새 시도 허용.
    existing_q = (
        sb.table("brand_attribute_proposals")
        .select("field")
        .eq("brand_id", bid)
        .in_("status", ["pending", "approved", "auto_applied"])
        .execute()
    )
    skip_fields = {row["field"] for row in (existing_q.data or [])}

    proposals_to_insert = []
    for field, vals in [("vibe", parsed["vibe"]),
                        ("palette", parsed["palette"]),
                        ("material", parsed["material"])]:
        if not vals:
            continue
        if field in skip_fields:
            continue  # 중복 방지
        status = ("auto_applied" if conf >= AUTO_MERGE
                  else "pending" if conf >= REVIEW_FLOOR
                  else "rejected")
        row = {
            "brand_id": bid,
            "field": field,
            "proposed_values": vals,
            "confidence": round(conf, 2),
            "source": "llm:gpt-4o-mini@2026-05-07",
            "reasoning": parsed["rationale"][:500],
            "status": status,
        }
        if status == "auto_applied":
            row["applied_at"] = "now()"
        proposals_to_insert.append(row)

    # 2. brand_nodes UPDATE (high confidence only)
    bn_update = {}
    if conf >= AUTO_MERGE:
        if parsed["sensitivity_tags"]:
            bn_update["sensitivity_tags"] = parsed["sensitivity_tags"]
        if parsed["brand_keywords"]:
            bn_update["brand_keywords"] = parsed["brand_keywords"]
        # attributes merge
        new_attrs = dict(brand.get("attributes") or {})
        for k in ("vibe", "palette", "material"):
            if parsed[k]:
                new_attrs[k] = parsed[k]
        if new_attrs:
            bn_update["attributes"] = new_attrs

    if dry_run:
        return ("DRY", len(proposals_to_insert), bool(bn_update))

    if proposals_to_insert:
        sb.table("brand_attribute_proposals").insert(proposals_to_insert).execute()
    if bn_update:
        sb.table("brand_nodes").update(bn_update).eq("id", bid).execute()

    return ("OK", len(proposals_to_insert), bool(bn_update))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--model", default="gpt-4o-mini")
    p.add_argument("--workers", type=int, default=10, help="동시 LLM 호출 수")
    args = p.parse_args()

    sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    # LiteLLM proxy 사용 — OpenAI-compat.
    # 보안: brand_name + 상품 샘플이 외부로 나가므로 평문 HTTP 차단.
    # HTTP 강제 우회 시 LITELLM_ALLOW_INSECURE=1 환경변수 필요.
    base_url = os.environ.get("LITELLM_BASE_URL")
    if not base_url:
        print("ERROR: LITELLM_BASE_URL 환경변수 필요 (https:// 권장)")
        sys.exit(1)
    if base_url.startswith("http://") and os.environ.get("LITELLM_ALLOW_INSECURE") != "1":
        print(
            f"ERROR: LITELLM_BASE_URL 이 평문 HTTP ({base_url}). "
            "HTTPS endpoint 사용 또는 LITELLM_ALLOW_INSECURE=1 설정 필요."
        )
        sys.exit(1)
    api_key = os.environ.get("LITELLM_API_KEY") or os.environ.get("LITELLM_MASTER_KEY")
    if not api_key:
        print("ERROR: LITELLM_API_KEY 또는 LITELLM_MASTER_KEY 가 환경변수에 없음")
        sys.exit(1)
    client = OpenAI(base_url=f"{base_url.rstrip('/')}/v1", api_key=api_key)

    print(f"[1/3] 빈 메타 brand 로드...")
    brands = load_target_brands(sb, args.limit)
    print(f"     대상 {len(brands)}개")
    if not brands:
        return

    print(f"[2/3] LLM 추론 시작 (model={args.model}, workers={args.workers}, dry_run={args.dry_run})...")
    auto_n = pending_n = reject_n = err_n = 0
    t0 = time.time()
    lock = threading.Lock()
    done = [0]

    def process_one(idx, b):
        try:
            sig = gather_signals(sb, b["brand_name"], n=10)
            user_msg = build_user_message(b["brand_name"], sig)
            raw = call_llm(client, args.model, b["brand_name"], user_msg)
            parsed = sanitize(raw)
            apply_to_db(sb, b, parsed, dry_run=args.dry_run)
            tag = ("AUTO" if parsed["confidence"] >= AUTO_MERGE
                   else "REVIEW" if parsed["confidence"] >= REVIEW_FLOOR
                   else "REJECT")
            return idx, b, parsed, tag, None
        except Exception as e:
            return idx, b, None, "ERROR", str(e)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = [ex.submit(process_one, i, b) for i, b in enumerate(brands, 1)]
        for fut in as_completed(futures):
            idx, b, parsed, tag, err = fut.result()
            with lock:
                done[0] += 1
                d = done[0]
            if err:
                err_n += 1
                print(f"  [{d}/{len(brands)}] {b['brand_name'][:30]:30s} ERROR: {err[:80]}")
                continue
            if tag == "AUTO": auto_n += 1
            elif tag == "REVIEW": pending_n += 1
            else: reject_n += 1
            if d <= 5 or d % 50 == 0:
                print(f"  [{d}/{len(brands)}] {b['brand_name'][:30]:30s} "
                      f"conf={parsed['confidence']:.2f} {tag} "
                      f"sens={parsed['sensitivity_tags'][:2]} "
                      f"vibe={parsed['vibe']} palette={parsed['palette'][:2]}")

    print(f"\n[3/3] 완료 ({time.time()-t0:.1f}s)")
    print(f"     AUTO   (>= {AUTO_MERGE}): {auto_n}")
    print(f"     REVIEW ({REVIEW_FLOOR}~{AUTO_MERGE}): {pending_n}")
    print(f"     REJECT (< {REVIEW_FLOOR}): {reject_n}")
    print(f"     ERROR : {err_n}")


if __name__ == "__main__":
    main()
