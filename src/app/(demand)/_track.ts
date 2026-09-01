import {track} from "@/lib/analytics"

// (demand) 셀럽 수요검증 랜딩 전용 계측 래퍼.
// 모든 이벤트에 surface:"celeb"를 붙여, 같은 Amplitude 프로젝트를 쓰는
// 다른 랜딩(/chat, 마케팅 원페이저 등)과 확실히 분리한다.
// → Amplitude 차트는 전부 surface=celeb로 필터, 진입은 Page Viewed(path=/celeb)로 잡는다.
export function trackCeleb(name: string, props: Record<string, unknown> = {}): void {
  track(name, {surface: "celeb", ...props})
}
