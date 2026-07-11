"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuctionCall,
  Card,
  DoubleCall,
  LegalBid,
  PublicGameView,
  Seat,
  Suit,
} from "../lib/baloot/types";
import type {
  RoomClientAction,
  RoomPlayerView,
  RoomView,
} from "../lib/rooms/types";
import { AVATARS, type AvatarId } from "../lib/server/session";

type ConnectionState = "online" | "syncing" | "offline";

const SUIT_META: Record<Suit, { symbol: string; name: string }> = {
  spades: { symbol: "♠", name: "سبيت" },
  hearts: { symbol: "♥", name: "هاص" },
  diamonds: { symbol: "♦", name: "ديناري" },
  clubs: { symbol: "♣", name: "شيريا" },
};

const AVATAR_META: Record<AvatarId, { icon: string; label: string }> = {
  sword: { icon: "⚔", label: "سيفان" },
  falcon: { icon: "◈", label: "صقر" },
  palm: { icon: "♧", label: "نخلة" },
  coffee: { icon: "☕", label: "دلة" },
};

const DOUBLE_LABELS: Record<DoubleCall, string> = {
  pass: "تمرير",
  double: "دبل",
  triple: "ثري",
  four: "فور",
  coffee: "قهوة",
};

class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  } & T;
  if (!response.ok) {
    throw new RequestError(
      payload.error ?? "تعذر الاتصال بالطاولة.",
      response.status,
      payload.code ?? "request_failed",
    );
  }
  return payload;
}

function roomUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", code);
  return url.toString();
}

function cardName(card: Card): string {
  const ranks: Record<Card["rank"], string> = {
    "7": "سبعة",
    "8": "ثمانية",
    "9": "تسعة",
    "10": "عشرة",
    J: "ولد",
    Q: "بنت",
    K: "شايب",
    A: "إكة",
  };
  return `${ranks[card.rank]} ${SUIT_META[card.suit].name}`;
}

function PlayingCard({
  card,
  legal = true,
  selected = false,
  trump = false,
  onClick,
  onDoubleClick,
  shortcut,
}: {
  card: Card;
  legal?: boolean;
  selected?: boolean;
  trump?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  shortcut?: number;
}) {
  const interactive = Boolean(onClick);
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const content = (
    <>
      <span className="card-corner card-corner-top">
        <b>{card.rank}</b>
        <i>{SUIT_META[card.suit].symbol}</i>
      </span>
      <span className="card-center" aria-hidden="true">
        {SUIT_META[card.suit].symbol}
      </span>
      <span className="card-corner card-corner-bottom" aria-hidden="true">
        <b>{card.rank}</b>
        <i>{SUIT_META[card.suit].symbol}</i>
      </span>
      {trump ? <span className="trump-mark">حكم</span> : null}
      {shortcut ? <span className="card-shortcut">{shortcut}</span> : null}
    </>
  );
  if (!interactive) {
    return (
      <div className="playing-card" data-red={red} data-trump={trump}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="playing-card hand-card"
      data-legal={legal}
      data-red={red}
      data-selected={selected}
      data-trump={trump}
      disabled={!legal}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={`${cardName(card)}${trump ? "، حكم" : ""}${legal ? "، قابلة للعب" : "، غير قابلة للعب"}`}
      aria-pressed={selected}
    >
      {content}
    </button>
  );
}

function CardBack({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "card-back card-back-compact" : "card-back"} aria-hidden="true" />;
}

function ConnectionPill({ state }: { state: ConnectionState }) {
  const text = state === "online" ? "متصل" : state === "syncing" ? "جارٍ التحديث" : "غير متصل";
  return (
    <span className="connection-pill" data-state={state} role="status">
      <span className="connection-dot" />
      {text}
    </span>
  );
}

function PlayerSeat({
  player,
  position,
  active,
  dealer,
  cards,
}: {
  player?: RoomPlayerView;
  position: "bottom" | "right" | "top" | "left";
  active: boolean;
  dealer: boolean;
  cards: number;
}) {
  if (!player) return null;
  const initials = player.displayName.slice(0, 2);
  return (
    <div className={`player-seat seat-${position}`} data-active={active}>
      <div className="player-avatar" data-avatar={player.avatar} aria-hidden="true">
        {player.isBot ? AVATAR_META[player.avatar].icon : initials}
      </div>
      <div className="player-copy">
        <div className="player-name-row">
          <strong>{player.displayName}</strong>
          {player.isBot ? <span className="bot-tag">آلي</span> : null}
          {dealer ? <span className="dealer-tag" title="الموزع">م</span> : null}
        </div>
        <span className="player-meta">
          {player.connected ? "متصل" : "يعيد الاتصال"} · {cards} ورق
        </span>
      </div>
      {position !== "bottom" && cards > 0 ? (
        <div className="opponent-cards" aria-label={`${cards} أوراق متبقية`}>
          {Array.from({ length: Math.min(cards, 5) }, (_, index) => (
            <CardBack compact key={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function bidLabel(bid: LegalBid, round: 1 | 2): string {
  if (bid.call === "pass") return round === 1 ? "بس" : "ولا";
  if (bid.call === "sun") return "صن";
  if (bid.call === "ashkal") return "أشكل";
  if (bid.call === "confirm_hokom") return "تأكيد الحكم";
  if (bid.call === "confirm_sun") return "قلبها صن";
  return `حكم ${bid.suit ? SUIT_META[bid.suit].symbol : ""}`;
}

function BidPanel({
  game,
  busy,
  onBid,
}: {
  game: PublicGameView;
  busy: boolean;
  onBid: (bid: LegalBid) => void;
}) {
  const isMyTurn = game.currentPlayer === game.seat;
  return (
    <section className="decision-panel bid-panel" aria-label="المزايدة">
      <div className="decision-kicker">{game.auction.round === 1 ? "أول" : "ثاني"}</div>
      <h2>{isMyTurn ? "اختر طلبك" : "المزايدة جارية"}</h2>
      <p>
        {game.auction.pendingHokom
          ? `طلب حكم ${SUIT_META[game.auction.pendingHokom.suit].symbol} بانتظار الحسم`
          : game.auction.round === 1
            ? "الصن أقوى، والحكم يتبع ورقة المشترى"
            : "الحكم الثاني يجب أن يختلف عن ورقة المشترى"}
      </p>
      {isMyTurn ? (
        <div className="decision-actions">
          {game.legalBids.map((bid) => (
            <button
              type="button"
              className={bid.call === "pass" ? "action-secondary" : "action-primary"}
              disabled={busy}
              key={`${bid.call}-${bid.suit ?? ""}`}
              onClick={() => onBid(bid)}
            >
              {bidLabel(bid, game.auction.round)}
            </button>
          ))}
        </div>
      ) : (
        <div className="waiting-dots" aria-label="بانتظار اللاعب"><i /><i /><i /></div>
      )}
    </section>
  );
}

function DoublingPanel({
  game,
  busy,
  onDouble,
}: {
  game: PublicGameView;
  busy: boolean;
  onDouble: (call: DoubleCall, locked?: boolean) => void;
}) {
  const isMyTurn = game.currentPlayer === game.seat;
  return (
    <section className="decision-panel doubling-panel" aria-label="التدبيل">
      <div className="decision-kicker">المضاعفة</div>
      <h2>{isMyTurn ? "قرارك قبل اللعب" : "نافذة التدبيل"}</h2>
      <p>{game.contract?.kind === "sun" ? "في الصن يسمح بالدبل فقط" : "دبل، ثري، فور، ثم قهوة"}</p>
      {isMyTurn ? (
        <div className="decision-actions">
          {game.legalDoubleCalls.flatMap((call) => {
            if (call === "double" || call === "four") {
              return [
                <button type="button" className="action-primary" disabled={busy} key={`${call}-open`} onClick={() => onDouble(call, false)}>
                  {DOUBLE_LABELS[call]} مفتوح
                </button>,
                <button type="button" className="action-secondary" disabled={busy} key={`${call}-locked`} onClick={() => onDouble(call, true)}>
                  {DOUBLE_LABELS[call]} مقفل
                </button>,
              ];
            }
            return [
              <button
                type="button"
                className={call === "pass" ? "action-secondary" : "action-primary"}
                disabled={busy}
                key={call}
                onClick={() => onDouble(call)}
              >
                {DOUBLE_LABELS[call]}
              </button>,
            ];
          })}
        </div>
      ) : (
        <div className="waiting-dots" aria-label="بانتظار قرار التدبيل"><i /><i /><i /></div>
      )}
    </section>
  );
}

function ResultSheet({
  game,
  busy,
  onNext,
}: {
  game: PublicGameView;
  busy: boolean;
  onNext: () => void;
}) {
  const result = game.roundResult;
  if (!result) return null;
  const myTeam = (game.seat % 2) as 0 | 1;
  const otherTeam = (1 - myTeam) as 0 | 1;
  const matchOver = game.phase === "match_end";
  const won = result.matchWinner === myTeam || (!matchOver && result.winningTeam === myTeam);
  return (
    <div className="sheet-backdrop">
      <section className="result-sheet" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <div className="result-emblem" data-win={won}>{won ? "✦" : "◆"}</div>
        <p className="result-kicker">{matchOver ? "انتهت الصكة" : `نتيجة الجولة ${game.roundNumber}`}</p>
        <h2 id="result-title">{matchOver ? (won ? "فزتم بالصكة" : "انتهت الصكة للخصم") : won ? "الجولة لكم" : "الجولة للخصم"}</h2>
        <div className="score-breakdown">
          <div><span>التقاط الورق</span><b>{result.cardGamePoints[myTeam]}</b><b>{result.cardGamePoints[otherTeam]}</b></div>
          <div><span>المشاريع</span><b>{result.projectPoints[myTeam]}</b><b>{result.projectPoints[otherTeam]}</b></div>
          <div className="score-total"><span>قيد الجولة</span><b>{result.roundPoints[myTeam]}</b><b>{result.roundPoints[otherTeam]}</b></div>
          <div className="score-head"><span /><em>لنا</em><em>لهم</em></div>
        </div>
        <p className="result-reason">{result.reason}</p>
        {!matchOver ? (
          <button type="button" className="action-primary result-next" disabled={busy} onClick={onNext}>
            الجولة التالية
          </button>
        ) : null}
      </section>
    </div>
  );
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop rules-backdrop" onMouseDown={onClose}>
      <section className="rules-sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="eyebrow">نظام البطولة السعودي</span><h2 id="rules-title">قواعد مجلس بلوت</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق القواعد">×</button>
        </header>
        <div className="rules-grid">
          <article><b>الترتيب</b><p>الصن: A، 10، K، Q، J، 9، 8، 7. الحكم: J، 9، A، 10، K، Q، 8، 7.</p></article>
          <article><b>الشراء</b><p>دورتان فقط. في أول يكون الحكم من نوع المشترى، وفي ثاني يختار المشتري نوعًا مختلفًا. الصن يعلو الحكم.</p></article>
          <article><b>اللعب القانوني</b><p>متابعة النوع واجبة. في الحكم يفرض القطع أو التعلية عندما يستطيع اللاعب كسب الأكلة وفق وضع الشريك.</p></article>
          <article><b>المشاريع</b><p>سرا، خمسين، مائة، أربعمائة في الصن، وبلوت للشايب والبنت من الحكم.</p></article>
          <article><b>الحساب</b><p>الصن 26 والحكم 16. الكبوت 44 في الصن و25 في الحكم. تنتهي الصكة عند 152.</p></article>
          <article><b>التدبيل</b><p>الصن يقبل الدبل فقط بشروطه. الحكم يقبل دبل، ثري، فور، وقهوة، مع المفتوح والمقفل.</p></article>
        </div>
        <p className="rules-source">مرجع التطبيق: <a href="https://enjoy.sa/media/j1ofreng/baloot.pdf" target="_blank" rel="noreferrer">اللائحة العامة الرسمية للبلوت</a>.</p>
      </section>
    </div>
  );
}

export function BalootApp() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>("sword");
  const [joinCode, setJoinCode] = useState("");
  const [invitedCode, setInvitedCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const clientInstanceId = useRef("");

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    const bootstrap = window.setTimeout(() => {
      clientInstanceId.current = crypto.randomUUID();
      const savedName = window.localStorage.getItem("majlis-baloot-name");
      const savedAvatar = window.localStorage.getItem("majlis-baloot-avatar") as AvatarId | null;
      if (savedName) setDisplayName(savedName);
      if (savedAvatar && AVATARS.includes(savedAvatar)) setAvatar(savedAvatar);
      const code = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
      if (!code) return;
      setJoinCode(code);
      setInvitedCode(code);
      void (async () => {
        try {
          const payload = await responseJson<{ room: RoomView }>(await fetch(`/api/rooms/${code}`, { cache: "no-store" }));
          setRoom(payload.room);
          setInvitedCode("");
        } catch (requestError) {
          if (!(requestError instanceof RequestError) || requestError.status !== 401) {
            setError(requestError instanceof Error ? requestError.message : "تعذر فتح الغرفة.");
          }
        }
      })();
    }, 0);
    return () => window.clearTimeout(bootstrap);
  }, []);

  const rememberProfile = useCallback(() => {
    window.localStorage.setItem("majlis-baloot-name", displayName.trim());
    window.localStorage.setItem("majlis-baloot-avatar", avatar);
  }, [avatar, displayName]);

  const enterRoom = useCallback((nextRoom: RoomView) => {
    setRoom(nextRoom);
    roomRef.current = nextRoom;
    setSelectedCard(null);
    setError("");
    window.history.replaceState({}, "", roomUrl(nextRoom.code));
  }, []);

  const create = useCallback(async (mode: "multiplayer" | "quick") => {
    if (displayName.trim().length < 2) {
      setError("اكتب اسمًا من حرفين على الأقل.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      rememberProfile();
      const payload = await responseJson<{ room: RoomView }>(
        await fetch("/api/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName, avatar, mode }),
        }),
      );
      enterRoom(payload.room);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذر إنشاء الغرفة.");
    } finally {
      setBusy(false);
    }
  }, [avatar, displayName, enterRoom, rememberProfile]);

  const join = useCallback(async () => {
    const code = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (displayName.trim().length < 2 || code.length !== 6) {
      setError("أدخل اسمك ورمز الغرفة المكوّن من 6 خانات.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      rememberProfile();
      const payload = await responseJson<{ room: RoomView }>(
        await fetch(`/api/rooms/${code}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName, avatar }),
        }),
      );
      enterRoom(payload.room);
      setInvitedCode("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذر الانضمام.");
    } finally {
      setBusy(false);
    }
  }, [avatar, displayName, enterRoom, joinCode, rememberProfile]);

  const fetchCurrentRoom = useCallback(async (force = false) => {
    const current = roomRef.current;
    if (!current) return;
    const query = force ? "" : `?sinceGame=${current.version}&sincePresence=${current.presenceVersion}`;
    const response = await fetch(`/api/rooms/${current.code}${query}`, { cache: "no-store" });
    if (response.status === 204) return;
    const payload = await responseJson<{ room: RoomView }>(response);
    setRoom(payload.room);
    roomRef.current = payload.room;
  }, []);

  const activeRoomCode = room?.code;

  useEffect(() => {
    if (!activeRoomCode) return;
    let stopped = false;
    let timeout = 0;
    const poll = async () => {
      try {
        await fetchCurrentRoom();
        if (!stopped) setConnection("online");
      } catch {
        if (!stopped) setConnection("offline");
      } finally {
        if (!stopped) {
          const current = roomRef.current;
          const base = document.hidden ? 6000 : current?.status === "lobby" ? 1700 : 950;
          timeout = window.setTimeout(poll, base + Math.floor(Math.random() * 260));
        }
      }
    };
    timeout = window.setTimeout(poll, 700);
    return () => {
      stopped = true;
      window.clearTimeout(timeout);
    };
  }, [activeRoomCode, fetchCurrentRoom]);

  useEffect(() => {
    if (!activeRoomCode) return;
    const touch = async () => {
      const current = roomRef.current;
      if (!current) return;
      try {
        await fetch(`/api/rooms/${current.code}/presence`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientInstanceId: clientInstanceId.current }),
        });
      } catch {
        setConnection("offline");
      }
    };
    void touch();
    const interval = window.setInterval(touch, 12_000);
    return () => window.clearInterval(interval);
  }, [activeRoomCode]);

  const sendAction = useCallback(async (action: RoomClientAction) => {
    const current = roomRef.current;
    if (!current || busy) return;
    setBusy(true);
    setConnection("syncing");
    setError("");
    try {
      const payload = await responseJson<{ room: RoomView }>(
        await fetch(`/api/rooms/${current.code}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            clientActionId: crypto.randomUUID(),
            expectedVersion: current.version,
          }),
        }),
      );
      setRoom(payload.room);
      roomRef.current = payload.room;
      setSelectedCard(null);
      setConnection("online");
    } catch (requestError) {
      if (requestError instanceof RequestError && requestError.status === 409) {
        await fetchCurrentRoom(true).catch(() => undefined);
      }
      setError(requestError instanceof Error ? requestError.message : "تعذر تنفيذ الحركة.");
      setConnection("offline");
    } finally {
      setBusy(false);
    }
  }, [busy, fetchCurrentRoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const game = roomRef.current?.game;
      if (!game || game.phase !== "playing" || game.currentPlayer !== game.seat) return;
      if (/^[1-8]$/.test(event.key)) {
        const target = game.hand[Number(event.key) - 1];
        if (target && game.legalCardIds.includes(target.id)) setSelectedCard(target.id);
      } else if (event.key === "Escape") {
        setSelectedCard(null);
      } else if (event.key === "Enter" && selectedCard) {
        void sendAction({ type: "play_card", cardId: selectedCard });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCard, sendAction]);

  const leave = () => {
    setRoom(null);
    roomRef.current = null;
    setSelectedCard(null);
    setError("");
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState({}, "", url.toString());
  };

  const copyInvite = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(roomUrl(room.code));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (!room) {
    return (
      <main className="landing-shell">
        <div className="ambient ambient-one" /><div className="ambient ambient-two" />
        <header className="landing-nav">
          <a className="brand" href="#" aria-label="مجلس بلوت"><span className="brand-mark">م</span><span><b>مجلس</b><small>بلوت</small></span></a>
          <button type="button" className="nav-link" onClick={() => setRulesOpen(true)}>القواعد الرسمية</button>
        </header>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow"><i /> بلوت سعودي · لعب جماعي مباشر</span>
            <h1>المجلس جاهز.<br /><em>واللعب على أصوله.</em></h1>
            <p>طاولة بلوت فاخرة بقواعد البطولة السعودية، غرف خاصة برمز واحد، وتجربة سلسة من الجوال أو الكمبيوتر.</p>
            <div className="trust-row"><span>32</span><small>ورقة</small><i /><span>4</span><small>لاعبين</small><i /><span>152</span><small>للفوز</small></div>
          </div>
          <div className="entry-card">
            <div className="entry-card-head">
              <span className="entry-icon">♠</span>
              <div><span className="eyebrow">ادخل المجلس</span><h2>{invitedCode ? `دعوة إلى ${invitedCode}` : "ابدأ لعبتك"}</h2></div>
            </div>
            <label className="field-label" htmlFor="player-name">اسمك على الطاولة</label>
            <input id="player-name" className="text-field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="مثال: أبو فيصل" maxLength={18} autoComplete="nickname" />
            <span className="field-label">اختر رمزك</span>
            <div className="avatar-picker" role="radiogroup" aria-label="اختيار الرمز">
              {AVATARS.map((item) => (
                <button type="button" role="radio" aria-checked={avatar === item} data-selected={avatar === item} key={item} onClick={() => setAvatar(item)} title={AVATAR_META[item].label}>
                  {AVATAR_META[item].icon}
                </button>
              ))}
            </div>
            <button type="button" className="action-primary quick-button" disabled={busy} onClick={() => void create("quick")}><span>لعب سريع</span><small>ضد 3 لاعبين آليين</small></button>
            <button type="button" className="action-secondary create-button" disabled={busy} onClick={() => void create("multiplayer")}>إنشاء غرفة للأصدقاء</button>
            <div className="entry-divider"><span>أو انضم برمز</span></div>
            <div className="join-row">
              <input className="code-field" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABC234" dir="ltr" aria-label="رمز الغرفة" />
              <button type="button" className="join-button" disabled={busy} onClick={() => void join()}>انضم</button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <p className="entry-note"><span>●</span> دخول ضيف فوري — بلا تسجيل حساب</p>
          </div>
          <div className="hero-table" aria-hidden="true">
            <div className="mini-felt"><span className="mini-card mini-card-one">A<em>♠</em></span><span className="mini-card mini-card-two">J<em>♥</em></span><span className="mini-card mini-card-three">9<em>♥</em></span><i className="felt-star">✦</i></div>
          </div>
        </section>
        <footer className="landing-footer"><span>قواعد <b>ksa_tournament</b></span><span>مصمم للّمس ولوحة المفاتيح</span><span>حالة خادم موثوقة</span></footer>
        {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
      </main>
    );
  }

  if (!room.game) {
    return (
      <main className="lobby-shell">
        <header className="game-header">
          <a className="brand compact-brand" href="#" onClick={(event) => { event.preventDefault(); leave(); }}><span className="brand-mark">م</span><span><b>مجلس</b><small>بلوت</small></span></a>
          <ConnectionPill state={connection} />
          <div className="header-actions"><button type="button" className="icon-button" onClick={() => setRulesOpen(true)}>؟</button><button type="button" className="header-text-button" onClick={leave}>خروج</button></div>
        </header>
        <section className="lobby-card">
          <span className="eyebrow">غرفة خاصة</span><h1>جهّز مجلسك</h1><p>أرسل الرمز أو الرابط لثلاثة أصدقاء. الشركاء يجلسون متقابلين.</p>
          <div className="room-code-block"><span>رمز الغرفة</span><strong dir="ltr">{room.code}</strong><button type="button" onClick={() => void copyInvite()}>{copied ? "تم النسخ" : "نسخ الرابط"}</button></div>
          <div className="lobby-seats">
            {([0, 1, 2, 3] as Seat[]).map((seat) => {
              const player = room.players.find((candidate) => candidate.seat === seat);
              return <div className="lobby-seat" data-filled={Boolean(player)} key={seat}>{player ? <><div className="lobby-avatar">{player.isBot ? AVATAR_META[player.avatar].icon : player.displayName.slice(0, 2)}</div><strong>{player.displayName}</strong><span>{player.isHost ? "المضيف" : "جاهز"}</span></> : <><div className="empty-seat">+</div><strong>مقعد فارغ</strong><span>بانتظار لاعب</span></>}</div>;
            })}
          </div>
          <div className="team-divider"><span>فريق</span><i /><span>فريق</span></div>
          <button type="button" className="action-primary start-button" disabled={!room.canStart || busy} onClick={() => void sendAction({ type: "start" })}>{room.canStart ? "ابدأ اللعب" : `بانتظار ${4 - room.players.length} لاعب`}</button>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </section>
        {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
      </main>
    );
  }

  const game = room.game;
  const mySeat = game.seat;
  const myTeam = (mySeat % 2) as 0 | 1;
  const otherTeam = (1 - myTeam) as 0 | 1;
  const positions: Array<{ offset: 0 | 1 | 2 | 3; position: "bottom" | "right" | "top" | "left" }> = [
    { offset: 0, position: "bottom" }, { offset: 1, position: "right" }, { offset: 2, position: "top" }, { offset: 3, position: "left" },
  ];
  const contractLabel = game.contract ? game.contract.kind === "sun" ? "صن" : `حكم ${game.contract.trump ? SUIT_META[game.contract.trump].symbol : ""}` : `المزايدة · ${game.auction.round === 1 ? "أول" : "ثاني"}`;
  const selected = game.hand.find((item) => item.id === selectedCard);
  const canPlaySelected = selected && game.legalCardIds.includes(selected.id) && game.currentPlayer === mySeat;

  return (
    <main className="game-shell">
      <header className="game-header">
        <a className="brand compact-brand" href="#" onClick={(event) => { event.preventDefault(); leave(); }}><span className="brand-mark">م</span><span><b>مجلس</b><small>بلوت</small></span></a>
        <div className="score-bar"><div><span>لنا</span><strong>{game.matchScores[myTeam]}</strong></div><i /><div><span>لهم</span><strong>{game.matchScores[otherTeam]}</strong></div><small>{contractLabel}{game.contract && game.contract.multiplier > 1 ? ` ×${game.contract.multiplier}` : ""}</small></div>
        <div className="header-actions"><ConnectionPill state={connection} /><button type="button" className="icon-button" onClick={() => setRulesOpen(true)}>؟</button><button type="button" className="header-text-button room-chip" onClick={() => void copyInvite()}>{copied ? "نُسخ" : room.code}</button></div>
      </header>
      {connection === "offline" ? <div className="reconnect-banner">جارٍ استعادة الاتصال بالطاولة…</div> : null}
      <section className="table-stage" aria-label="طاولة البلوت">
        <div className="table-surface"><div className="felt-ornament">✦</div><div className="felt-ring" /></div>
        {positions.map(({ offset, position }) => {
          const seat = ((mySeat + offset) % 4) as Seat;
          return <PlayerSeat key={seat} position={position} player={room.players.find((player) => player.seat === seat)} active={game.currentPlayer === seat} dealer={game.dealer === seat} cards={game.handCounts[seat]} />;
        })}
        <div className="table-status" aria-live="polite"><span>الجولة {game.roundNumber}</span><strong>{game.currentPlayer === mySeat ? "دورك الآن" : `دور ${room.players.find((player) => player.seat === game.currentPlayer)?.displayName ?? "اللاعب"}`}</strong></div>
        {game.phase === "bidding" || game.phase === "doubling" ? (
          <div className="market-card"><span>المشترى</span><PlayingCard card={game.faceUpCard} trump={game.contract?.trump === game.faceUpCard.suit} /></div>
        ) : null}
        <div className="trick-center">
          {game.currentTrick.plays.map((play) => {
            const relative = (play.seat - mySeat + 4) % 4;
            const pos = ["bottom", "right", "top", "left"][relative];
            return <div className={`trick-card trick-${pos}`} key={`${play.seat}-${play.card.id}`}><PlayingCard card={play.card} trump={game.contract?.trump === play.card.suit} /></div>;
          })}
        </div>
        {game.phase === "bidding" ? <BidPanel game={game} busy={busy} onBid={(bid) => void sendAction({ type: "bid", call: bid.call as AuctionCall, ...(bid.suit ? { suit: bid.suit } : {}) })} /> : null}
        {game.phase === "doubling" ? <DoublingPanel game={game} busy={busy} onDouble={(call, locked) => void sendAction({ type: "double", call, ...(locked === undefined ? {} : { locked }) })} /> : null}
        {game.projects?.counted.length ? <div className="project-strip">{game.projects.counted.map((project, index) => <span key={`${project.seat}-${project.kind}-${index}`}>{project.kind === "baloot" ? "بلوت" : project.gamePoints >= 20 ? "مائة" : project.gamePoints >= 10 ? "خمسين" : "سرا"}</span>)}</div> : null}
        <div className="hand-rail" data-turn={game.currentPlayer === mySeat && game.phase === "playing"}>
          <div className="hand" role="group" aria-label="أوراقك">
            {game.hand.map((item, index) => {
              const legal = game.phase === "playing" && game.legalCardIds.includes(item.id);
              return <PlayingCard key={item.id} card={item} legal={legal} selected={selectedCard === item.id} trump={game.contract?.trump === item.suit} shortcut={index + 1} onClick={() => setSelectedCard((current) => current === item.id ? null : item.id)} onDoubleClick={() => legal && void sendAction({ type: "play_card", cardId: item.id })} />;
            })}
          </div>
          {game.phase === "playing" ? <button type="button" className="play-card-button" disabled={!canPlaySelected || busy} onClick={() => selected && void sendAction({ type: "play_card", cardId: selected.id })}>{game.currentPlayer === mySeat ? "العب الورقة" : "بانتظار دورك"}</button> : null}
        </div>
      </section>
      {error ? <div className="toast" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>×</button></div> : null}
      {(game.phase === "round_end" || game.phase === "match_end") ? <ResultSheet game={game} busy={busy} onNext={() => void sendAction({ type: "next_round" })} /> : null}
      {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
    </main>
  );
}
