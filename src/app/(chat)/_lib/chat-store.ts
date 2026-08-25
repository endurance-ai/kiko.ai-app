// Module-scope chat store — keeps the conversation alive across route changes
// (챗 ↔ 카테고리로 찾기) since Next.js unmounts /chat when navigating to /explore.
// This is intentionally NOT React state: a plain module-level object survives
// component unmount/remount, so background stream callbacks can keep writing
// to it even while /chat isn't mounted, and the next mount just reads it back.

import type { ClarifyPayload, ProductRef } from "./chat-stream"

export interface ChatTurn {
  id: number
  query: string
  streamText: string
  products: ProductRef[]
  streamDone: boolean
  searchTotal: number | null
  error?: string
  /** 서버 clarify 이벤트(선택지 버튼) — 있으면 턴 하단에 알약 버튼으로 렌더 */
  clarify?: ClarifyPayload | null
  /** 이미 탭한 clarify callback 들 — 비활성 음영으로 이력 보존 (모바일 문법) */
  clarifyPicks?: string[]
}

interface ChatStoreState {
  turns: ChatTurn[]
  turnCounter: number
  lastHandledQ: string | null
  sessionId: string | null
  /** 히어로 성별 토글에서 넘어온 값 — 서버 계약: 'women' | 'men' | null(공용, 서버가 재질문) */
  gender: "women" | "men" | null
  /** 일일 사용량 한도 도달 여부 — "새 검색"으로 대화는 리셋되어도 한도는 풀리지 않는다. */
  capReached: boolean
  /** ISO 8601 — 한도가 풀리는 시각 (cap_reached 이벤트의 reset_at) */
  capResetAt: string | null
}

function emptyState(): ChatStoreState {
  return {
    turns: [],
    turnCounter: 0,
    lastHandledQ: null,
    sessionId: null,
    gender: null,
    capReached: false,
    capResetAt: null,
  }
}

let state: ChatStoreState = emptyState()
let activeController: AbortController | null = null

export function getChatStore(): ChatStoreState {
  return state
}

export function setChatStore(patch: Partial<ChatStoreState>): void {
  state = { ...state, ...patch }
}

/** 대화(turns/turnCounter/lastHandledQ/sessionId)만 리셋 — gender/capReached/capResetAt은 유지한다. */
export function resetChatStore(): void {
  state = {
    ...emptyState(),
    gender: state.gender,
    capReached: state.capReached,
    capResetAt: state.capResetAt,
  }
}

/** 진행 중인 스트림의 AbortController — 라우트 리마운트에도 살아남아야 abort가 유효하다. */
export function getActiveChatController(): AbortController | null {
  return activeController
}

export function setActiveChatController(controller: AbortController | null): void {
  activeController = controller
}
