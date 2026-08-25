"""
FashionSigLIP product image embedding batch — local / standalone runner.

SPEC-SEARCH-V6-001 §7b: reworked to target the normalized `product_embeddings`
table (was: products.embedding column). Remaining ~47k unembedded products are
processed locally (low cost) — AWS Spot is no longer required (SPEC §5). The
file path is kept (scripts/aws/) to avoid churn; it now runs anywhere with a
GPU/CPU + DB access.

Prereqs
  - torch / CUDA (DLAMI or local GPU; CPU also works, slower)
  - pip: open_clip_torch, supabase, httpx, pillow
  - env: DB_URL, DB_TOKEN (project standard; legacy SUPABASE_URL /
    SUPABASE_SERVICE_ROLE_KEY accepted as fallback), (optional) LIMIT

Behavior
  1. Page through in-stock products with NO product_embeddings row (server-side
     PostgREST anti-join: embedded product_embeddings resource filtered
     is.null, ordered by id — see fetch_pending). Image source per row is the
     canonical products.image_url; images[0] is only a compatibility mirror.
  2. Download the resolved image URL in parallel (ThreadPool 20).
  3. GPU/CPU batch (64) encode + L2-normalize.
  4. UPSERT into product_embeddings via bulk_update_product_embeddings RPC
     (reworked: ON CONFLICT product_id DO UPDATE, bigint product_id).
  5. Repeat until no pending rows remain.
"""
from __future__ import annotations

import io
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import httpx
import open_clip
import torch
from PIL import Image
from supabase import create_client

MODEL_ID = "hf-hub:Marqo/marqo-fashionSigLIP"
EMBEDDING_MODEL_NAME = "Marqo/marqo-fashionSigLIP"

GPU_BATCH = 64           # GPU/CPU forward-pass batch
FETCH_PAGE = 500         # page size
RPC_BATCH = 200          # products per bulk UPSERT RPC call
DOWNLOAD_WORKERS = 20    # parallel image download workers
MAX_IMAGE_BYTES = 10 * 1024 * 1024
HTTP_TIMEOUT = 20


def download_one(client: httpx.Client, pid: int, url: str) -> Optional[tuple[int, Image.Image]]:
    try:
        r = client.get(url)
        r.raise_for_status()
        if len(r.content) > MAX_IMAGE_BYTES:
            return None
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        return (pid, img)
    except Exception:
        return None


def fetch_pending(sb, page_limit: int) -> list[dict]:
    """Products with no product_embeddings row.

    products.image_url is the serving/search source of truth. Only active
    products with a canonical URL are useful to the search RPC; out-of-stock
    products become pending naturally if they are later restocked.

    Server-side anti-join: PostgREST embeds the product_embeddings resource as
    a LEFT JOIN and `product_embeddings=is.null` keeps only products that have
    NO matching product_embeddings row (product_embeddings is keyed on bigint
    product_id, SPEC §7a). `order("id")` makes paging deterministic so every
    unembedded product is covered and a transiently failed row reappears on a
    later pass. The caller loops until this returns empty; each UPSERT pass
    shrinks the anti-join result, so no cross-call cursor is needed.
    """
    resp = (
        sb.table("products")
        .select("id,image_url,product_embeddings(product_id)")
        .is_("product_embeddings", "null")
        .eq("in_stock", True)
        .not_.is_("image_url", "null")
        .order("id")
        .limit(page_limit)
        .execute()
    )
    return resp.data or []


def main() -> int:
    # Project standard = DB_URL / DB_TOKEN (formerly SUPABASE_URL /
    # SUPABASE_SERVICE_ROLE_KEY). Prefer standard; accept legacy as fallback.
    url = os.environ.get("DB_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("DB_TOKEN") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[fatal] DB_URL / DB_TOKEN 미설정 (또는 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)", file=sys.stderr)
        return 2

    limit_env = os.environ.get("LIMIT")
    limit = int(limit_env) if limit_env else None

    sb = create_client(url, key)

    print(f"[load] {MODEL_ID}")
    device = (
        "cuda" if torch.cuda.is_available()
        else "mps" if torch.backends.mps.is_available()  # Apple Silicon GPU
        else "cpu"
    )
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_ID)
    model = model.to(device).eval()
    print(f"[load] ready on {device}")

    total_embedded = 0
    total_skipped = 0
    total_failed = 0
    processed = 0
    t_start = time.time()

    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as http:
        while True:
            page_limit = FETCH_PAGE
            if limit is not None:
                remaining = limit - processed
                if remaining <= 0:
                    break
                page_limit = min(FETCH_PAGE, remaining)

            rows = fetch_pending(sb, page_limit)
            if not rows:
                print("[done] no more pending products")
                break

            jobs: list[tuple[int, str]] = []
            for row in rows:
                src = row.get("image_url")
                if not src:
                    total_skipped += 1
                    continue
                jobs.append((int(row["id"]), src))

            if not jobs:
                processed += len(rows)
                continue

            # parallel download — 20 workers
            fetched: list[tuple[int, Image.Image]] = []
            with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as pool:
                futures = [pool.submit(download_one, http, pid, u) for pid, u in jobs]
                for f in as_completed(futures):
                    result = f.result()
                    if result is None:
                        total_failed += 1
                    else:
                        fetched.append(result)

            if not fetched:
                processed += len(rows)
                continue

            # GPU/CPU batch encode
            updates: list[dict] = []
            for i in range(0, len(fetched), GPU_BATCH):
                chunk = fetched[i : i + GPU_BATCH]
                tensors = torch.stack([preprocess(img) for _, img in chunk]).to(device)
                with torch.no_grad():
                    feats = model.encode_image(tensors)
                    feats = feats / feats.norm(dim=-1, keepdim=True)
                vecs = feats.cpu().float().numpy()
                for (pid, _), vec in zip(chunk, vecs):
                    updates.append({
                        "id": str(pid),  # bigint product_id (RPC casts ::bigint)
                        "embedding": "[" + ",".join(f"{x:.6f}" for x in vec.tolist()) + "]",
                        "model": EMBEDDING_MODEL_NAME,
                    })

            for i in range(0, len(updates), RPC_BATCH):
                batch = updates[i : i + RPC_BATCH]
                # bulk_update_product_embeddings reworked (migration 071):
                # UPSERT into product_embeddings, ON CONFLICT product_id.
                sb.rpc("bulk_update_product_embeddings", {"payload": batch}).execute()

            total_embedded += len(updates)
            processed += len(rows)
            elapsed = time.time() - t_start
            rate = total_embedded / elapsed if elapsed > 0 else 0
            print(
                f"[page] processed={processed} embedded={total_embedded} "
                f"skipped={total_skipped} failed={total_failed} rate={rate:.1f}/s"
            )

    print(
        f"[end] processed={processed} embedded={total_embedded} "
        f"skipped={total_skipped} failed={total_failed} "
        f"elapsed={round(time.time() - t_start, 1)}s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
