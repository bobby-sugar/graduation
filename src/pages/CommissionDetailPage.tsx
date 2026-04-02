import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
    discardInboxCommissionRestoreIfDetailMismatch,
    readInboxCommissionRestoreForDetail,
} from "../commissionInboxHelpers";
import { useAuth } from "../contexts/AuthContext";
import CommissionDeliverySubmitButton from "../components/CommissionDeliverySubmitButton";
import CommissionPublisherDeliveryList from "../components/CommissionPublisherDeliveryList";
import CommissionReviewPayerActions from "../components/CommissionReviewPayerActions";

type CommissionStatus = 'new' | 'pending' | 'payment-pending' | 'wip' | 'review-pending' | 'revising' | 'done' | string;
type PaymentStatus = 'unpaid' | 'paid' | 'partial' | 'hold' | string;
type Direction = "commission" | "offer" | string;

const API_BASE_URL = "http://localhost:3000";
const EDIT_BACK_SKIP_PREFIX = "oc_commission_detail_skip_back_once:";

interface CommissionDetail {
  id: number;
  clientId?: number | null;
  artistId?: number | null;
  /** 登录用户已对该待确认稿件发送申请，等待发布方处理 */
  viewerPendingApplication?: boolean;
  /** 取消支付后发布方在详情页再次「进入待支付」时使用的申请消息 id */
  publisherReopenPaymentMessageId?: number | null;
  title: string;
  description?: string | null;
  category?: string | null;
  price: number;
  status: CommissionStatus;
  paymentStatus: PaymentStatus;
  direction: Direction;
  paymentPercent?: number | null;
  submittedAt: string;
  confirmedAt?: string | null;
  startLabel?: string | null;
  endLabel?: string | null;
  previewImageUrl?: string | null;
  client?: {
    username: string;
    avatarUrl?: string | null;
  } | null;
  artist?: {
    username: string;
    avatarUrl?: string | null;
  } | null;
}

interface ParsedDetailMeta {
  plainDescription: string;
  map: Record<string, string>;
}

function formatDate(time: string | null | undefined) {
  if (!time) return "-";
  const d = new Date(time);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDescription(rawDescription?: string | null): ParsedDetailMeta {
  if (!rawDescription) {
    return { plainDescription: "", map: {} };
  }
  const [plainPart, metaPart] = rawDescription.split("【筛选信息】");
  const map: Record<string, string> = {};
  if (metaPart) {
    metaPart
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf("：");
        if (idx > 0) {
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          map[key] = value;
        }
      });
  }
  return { plainDescription: (plainPart ?? "").trim(), map };
}

function mapApiToCommissionDetail(
  raw: Record<string, unknown>,
  previewImageUrl?: string,
): CommissionDetail | null {
  const idNum = Number(raw.id);
  if (!Number.isFinite(idNum) || idNum < 1) return null;
  return {
    id: idNum,
    clientId: (raw.clientId as number | null | undefined) ?? null,
    artistId: (raw.artistId as number | null | undefined) ?? null,
    viewerPendingApplication: raw.viewerPendingApplication === true,
    publisherReopenPaymentMessageId:
      typeof raw.publisherReopenPaymentMessageId === "number"
        ? raw.publisherReopenPaymentMessageId
        : null,
    title: raw.title as string,
    description: raw.description as string | null | undefined,
    category: raw.category as string | null | undefined,
    price: (raw.price as number | undefined) ?? 0,
    status: raw.status as CommissionStatus,
    paymentStatus: raw.paymentStatus as PaymentStatus,
    direction: (raw.direction as Direction | undefined) ?? "commission",
    paymentPercent: raw.paymentPercent as number | null | undefined,
    submittedAt: raw.submittedAt as string,
    confirmedAt: raw.confirmedAt as string | null | undefined,
    startLabel: raw.startLabel as string | null | undefined,
    endLabel: raw.endLabel as string | null | undefined,
    previewImageUrl,
    client: raw.client
      ? {
          username: (raw.client as { username: string }).username,
          avatarUrl: ((raw.client as { avatarUrl?: string | null }).avatarUrl ?? null) as string | null,
        }
      : null,
    artist: raw.artist
      ? {
          username: (raw.artist as { username: string }).username,
          avatarUrl: ((raw.artist as { avatarUrl?: string | null }).avatarUrl ?? null) as string | null,
        }
      : null,
  };
}

export default function CommissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const routeIdRef = useRef(id);
  routeIdRef.current = id;
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();
  const [data, setData] = useState<CommissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [cancelPayLoading, setCancelPayLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [rejectReviewLoading, setRejectReviewLoading] = useState(false);
  const [deliveryFiles, setDeliveryFiles] = useState<
    Array<{ name: string; url: string; relativePath?: string | null }>
  >([]);
  const [paymentConfirmModal, setPaymentConfirmModal] = useState<null | "pay" | "cancel-pay">(null);
  const [reopenApplyModal, setReopenApplyModal] = useState<null | "accept" | "reject">(null);
  const [reopenApplyBusy, setReopenApplyBusy] = useState(false);

  const handleBack = () => {
    if (id) {
      const skipKey = `${EDIT_BACK_SKIP_PREFIX}${id}`;
      if (sessionStorage.getItem(skipKey) === "1") {
        sessionStorage.removeItem(skipKey);
        if (window.history.length > 2) {
          navigate(-2);
          return;
        }
      }
    }
    const inboxRestore = readInboxCommissionRestoreForDetail(location.state, id);
    if (inboxRestore) {
      navigate("/inbox", { state: { inboxCommissionRestore: inboxRestore } });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/commissions", { replace: true });
  };

  useEffect(() => {
    discardInboxCommissionRestoreIfDetailMismatch(location.state, id);
  }, [id, location.state]);

  useEffect(() => {
    setPaymentConfirmModal(null);
    setReopenApplyModal(null);
  }, [id]);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    const snapshotId = id;
    const idNum = Number(snapshotId);
    if (!Number.isInteger(idNum) || idNum < 1) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/commissions/${snapshotId}`, { headers });
      if (routeIdRef.current !== snapshotId) return;
      if (!res.ok) {
        setData(null);
        return;
      }
      const raw: unknown = await res.json();
      if (routeIdRef.current !== snapshotId) return;
      if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        setData(null);
        return;
      }
      const imageUrl: string | undefined =
        typeof (raw as { previewImageUrl?: unknown }).previewImageUrl === "string" &&
        (raw as { previewImageUrl: string }).previewImageUrl.length > 0
          ? ((raw as { previewImageUrl: string }).previewImageUrl.startsWith("http")
              ? (raw as { previewImageUrl: string }).previewImageUrl
              : `${API_BASE_URL}${(raw as { previewImageUrl: string }).previewImageUrl}`)
          : undefined;

      const mapped = mapApiToCommissionDetail(raw as Record<string, unknown>, imageUrl);
      if (routeIdRef.current !== snapshotId) return;
      setData(mapped);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      if (routeIdRef.current === snapshotId) setData(null);
    } finally {
      if (routeIdRef.current === snapshotId) setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!id) return;
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<{ commissionId?: number }>;
      const cid = e.detail?.commissionId;
      if (cid != null && Number(cid) !== Number(id)) return;
      void fetchDetail();
    };
    window.addEventListener("oc-commission-updated", handler);
    return () => window.removeEventListener("oc-commission-updated", handler);
  }, [id, fetchDetail]);

  useEffect(() => {
    if (loading || !id || !token) return;
    if (!data) {
      setDeliveryFiles([]);
      return;
    }
    const payerIdGuess = data.direction === "offer" ? data.clientId : data.artistId;
    const viewerIsPayer = !!user && payerIdGuess === user.id;
    if (!viewerIsPayer || data.status !== "review-pending") {
      setDeliveryFiles([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/commissions/${id}/delivery-files`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const arr = await res.json();
        if (!cancelled && Array.isArray(arr)) setDeliveryFiles(arr);
      } catch {
        if (!cancelled) setDeliveryFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, id, token, user, data]);

  const handleReopenPaymentConfirm = useCallback(async () => {
    if (!token || !data?.publisherReopenPaymentMessageId) return;
    const mid = data.publisherReopenPaymentMessageId;
    setReopenApplyBusy(true);
    try {
      const res = await fetch(
        `/api/conversations/commission-applications/${mid}/confirm`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.message
          ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
          : "确认失败";
        throw new Error(detail);
      }
      await fetchDetail();
      window.dispatchEvent(new Event("oc-commission-updated"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败，请稍后重试";
      alert(msg);
    } finally {
      setReopenApplyBusy(false);
      setReopenApplyModal(null);
    }
  }, [token, data?.publisherReopenPaymentMessageId, fetchDetail]);

  const handleReopenPaymentReject = useCallback(async () => {
    if (!token || !data?.publisherReopenPaymentMessageId) return;
    const mid = data.publisherReopenPaymentMessageId;
    setReopenApplyBusy(true);
    try {
      const res = await fetch(
        `/api/conversations/commission-applications/${mid}/reject`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.message
          ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
          : "拒绝失败";
        throw new Error(detail);
      }
      await fetchDetail();
      window.dispatchEvent(new Event("oc-commission-updated"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败，请稍后重试";
      alert(msg);
    } finally {
      setReopenApplyBusy(false);
      setReopenApplyModal(null);
    }
  }, [token, data?.publisherReopenPaymentMessageId, fetchDetail]);

  if (loading) {
    return (
      <div className="commission-detail-page">
        <div className="commission-detail-card">
          <p className="commission-detail-loading">加载中…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="commission-detail-page">
        <div className="commission-detail-card">
          <p className="commission-detail-empty">未找到对应的稿件</p>
          <button className="commission-detail-back" onClick={handleBack}>返回</button>
        </div>
      </div>
    );
  }

  const { title, previewImageUrl, category, description, price, direction, client, artist } = data;
  const publisherId = direction === "offer" ? data.artistId ?? null : data.clientId ?? null;
  const payerId = direction === "offer" ? data.clientId ?? null : data.artistId ?? null;
  const isPublisher = !!user && publisherId === user.id;
  const isPayer = !!user && payerId === user.id;
  /** 发布者在待支付及之后不可再改稿、删稿；待确认但已绑定承接方（含取消支付退回）同待支付锁定 */
  const boundPublisherPayer =
    publisherId != null && payerId != null;
  const canPublisherEditOrDelete =
    isPublisher &&
    (data.status === "new" ||
      (data.status === "pending" && !boundPublisherPayer));
  const isPublisherAwaitingPaymentOnly =
    isPublisher &&
    data.paymentStatus !== "paid" &&
    data.status === "payment-pending";
  const needsPublisherReopenPayment =
    isPublisher &&
    data.status === "pending" &&
    boundPublisherPayer &&
    data.paymentStatus !== "paid" &&
    typeof data.publisherReopenPaymentMessageId === "number";
  const canApplyNow =
    data.status === "new" ||
    (data.status === "pending" && !boundPublisherPayer);
  const waitingPublisherConfirm =
    data.status === "pending" &&
    !isPublisher &&
    !isPayer &&
    data.viewerPendingApplication === true;
  /** 与 conversations.service getCommissionApplications 中 canPay 条件一致 */
  const canPayNow =
    isPayer &&
    data.status === "payment-pending" &&
    (data.paymentStatus === "unpaid" || data.paymentStatus === "partial");
  const payerAwaitingPublisherReopen =
    isPayer &&
    data.status === "pending" &&
    boundPublisherPayer &&
    data.paymentStatus !== "paid" &&
    !canPayNow;
  const canAcceptNow = isPayer && data.status === "review-pending";
  const canSubmitNow =
    isPublisher &&
    data.paymentStatus === "paid" &&
    (data.status === "wip" || data.status === "revising");
  /** 进行中 / 修改中 / 待验收：出稿方可查看与移除已同步的交付文件 */
  const canPublisherManageDelivery =
    isPublisher &&
    data.paymentStatus === "paid" &&
    (data.status === "wip" || data.status === "revising" || data.status === "review-pending");
  const publisherName = direction === "offer" ? artist?.username ?? "对方" : client?.username ?? "对方";
  const payerName = direction === "offer" ? client?.username ?? "对方" : artist?.username ?? "对方";
  const publisherAvatar = direction === "offer" ? artist?.avatarUrl ?? "" : client?.avatarUrl ?? "";
  const parsedDescription = parseDescription(description);
  const metaValue = (key: string) => parsedDescription.map[key];
  const amountText = metaValue("金额");
  const typeText = metaValue("稿件类型") || category || "-";
  const responseSpeed = metaValue("响应速度") ?? "-";
  const directionLabel = direction === "offer" ? "接稿" : "约稿";

  const handleDelete = async () => {
    if (!id || !token) return;
    const ok = window.confirm("确定要删除这条稿件吗？删除后不可恢复。");
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/commissions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "删除失败");
      }
      navigate("/commissions");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("删除失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  };

  const getOrCreateConversation = async (otherUserId: number) => {
    if (!token) throw new Error("请先登录");
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ otherUserId }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "创建会话失败");
    }
    return res.json();
  };

  const handlePrivateChat = async () => {
    if (!token) {
      alert("请先登录后再私信");
      navigate("/login");
      return;
    }
    if (!publisherId) {
      alert("未找到发布者，暂时无法发起私信");
      return;
    }
    setChatLoading(true);
    try {
      await getOrCreateConversation(publisherId);
      navigate("/inbox", { state: { otherUserId: publisherId } });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("打开聊天失败，请稍后重试");
    } finally {
      setChatLoading(false);
    }
  };

  const handleApply = async () => {
    if (!token) {
      alert("请先登录后再申请");
      navigate("/login");
      return;
    }
    if (!id) {
      alert("稿件信息无效，请返回重试");
      return;
    }
    setApplyLoading(true);
    try {
      const detailHeaders: Record<string, string> = {};
      if (token) detailHeaders.Authorization = `Bearer ${token}`;
      const detailRes = await fetch(`/api/commissions/${id}`, { headers: detailHeaders });
      if (!detailRes.ok) {
        throw new Error("无法获取稿件最新状态，请刷新页面后重试");
      }
      const fresh = await detailRes.json();
      const st = String(fresh.status ?? "");
      const dir = (fresh.direction ?? "commission") as Direction;
      const pubId = dir === "offer" ? fresh.artistId ?? null : fresh.clientId ?? null;
      const payIdFresh = dir === "offer" ? fresh.clientId ?? null : fresh.artistId ?? null;
      if (st !== "new" && st !== "pending") {
        alert("该稿件当前不可申请（可能已被他人确认或状态已更新），请刷新页面查看最新状态。");
        setData((prev) =>
          prev && prev.id === Number(id)
            ? {
                ...prev,
                status: st as CommissionStatus,
                clientId: fresh.clientId ?? null,
                artistId: fresh.artistId ?? null,
                viewerPendingApplication: fresh.viewerPendingApplication === true,
                publisherReopenPaymentMessageId:
                  typeof fresh.publisherReopenPaymentMessageId === "number"
                    ? fresh.publisherReopenPaymentMessageId
                    : null,
                title: typeof fresh.title === "string" ? fresh.title : prev.title,
                client: fresh.client
                  ? { username: fresh.client.username, avatarUrl: fresh.client.avatarUrl ?? null }
                  : prev.client,
                artist: fresh.artist
                  ? { username: fresh.artist.username, avatarUrl: fresh.artist.avatarUrl ?? null }
                  : prev.artist,
              }
            : prev,
        );
        return;
      }
      if (st === "pending" && pubId != null && payIdFresh != null) {
        alert("该稿件已确认承接方，当前不可再次申请。");
        setData((prev) =>
          prev && prev.id === Number(id)
            ? {
                ...prev,
                status: st as CommissionStatus,
                clientId: fresh.clientId ?? null,
                artistId: fresh.artistId ?? null,
                viewerPendingApplication: fresh.viewerPendingApplication === true,
                publisherReopenPaymentMessageId:
                  typeof fresh.publisherReopenPaymentMessageId === "number"
                    ? fresh.publisherReopenPaymentMessageId
                    : null,
                title: typeof fresh.title === "string" ? fresh.title : prev.title,
                client: fresh.client
                  ? { username: fresh.client.username, avatarUrl: fresh.client.avatarUrl ?? null }
                  : prev.client,
                artist: fresh.artist
                  ? { username: fresh.artist.username, avatarUrl: fresh.artist.avatarUrl ?? null }
                  : prev.artist,
              }
            : prev,
        );
        return;
      }
      if (!pubId) {
        alert("未找到发布者，暂时无法申请");
        return;
      }
      const conversation = await getOrCreateConversation(Number(pubId));
      const pubName =
        dir === "offer"
          ? (fresh.artist?.username ?? "对方")
          : (fresh.client?.username ?? "对方");
      const applyTitle = typeof fresh.title === "string" ? fresh.title : title;
      let imageUrl: string | null =
        typeof previewImageUrl === "string" && previewImageUrl.length > 0
          ? previewImageUrl
          : null;
      if (imageUrl && imageUrl.length > 600) {
        imageUrl = null;
      }
      const payload = {
        type: "commission_apply",
        commissionId: Number(id),
        title: applyTitle,
        imageUrl,
        requesterName: user?.username ?? "用户",
        publisherName: pubName,
      };
      const message = `__COMMISSION_CARD__${JSON.stringify(payload)}`;
      const sendRes = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: message }),
      });
      if (!sendRes.ok) {
        const errText = await sendRes.text();
        let detail = errText || "发送申请消息失败";
        try {
          const j = JSON.parse(errText) as { message?: string | string[] };
          if (Array.isArray(j.message)) detail = j.message.join("，");
          else if (typeof j.message === "string") detail = j.message;
        } catch {
          /* keep detail */
        }
        throw new Error(detail);
      }
      navigate("/inbox", { state: { otherUserId: Number(pubId) } });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message.trim() : "";
      alert(msg && msg.length < 300 ? msg : "申请发送失败，请稍后重试");
    } finally {
      setApplyLoading(false);
    }
  };

  const openPublisherProfile = () => {
    if (!publisherId) return;
    navigate(`/user/${publisherId}`);
  };

  const handlePay = async () => {
    if (!id || !token) return;
    setPayLoading(true);
    try {
      const res = await fetch(`/api/commissions/${id}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.message
          ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
          : "支付失败";
        throw new Error(detail);
      }
      const detailRes = await fetch(`/api/commissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const raw = await detailRes.json();
        const imageUrl: string | undefined =
          typeof raw.previewImageUrl === "string" && raw.previewImageUrl.length > 0
            ? (raw.previewImageUrl.startsWith("http") ? raw.previewImageUrl : `${API_BASE_URL}${raw.previewImageUrl}`)
            : undefined;
        const mapped = mapApiToCommissionDetail(raw, imageUrl);
        if (mapped) setData(mapped);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message.trim() : "";
      alert(msg && msg.length < 300 ? msg : "支付失败，请稍后重试");
    } finally {
      setPayLoading(false);
    }
  };

  const handleCancelPayment = async () => {
    if (!id || !token) return;
    setCancelPayLoading(true);
    try {
      const res = await fetch(`/api/commissions/${id}/cancel-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.message
          ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
          : "取消失败";
        throw new Error(detail);
      }
      const detailRes = await fetch(`/api/commissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const raw = await detailRes.json();
        const imageUrl: string | undefined =
          typeof raw.previewImageUrl === "string" && raw.previewImageUrl.length > 0
            ? (raw.previewImageUrl.startsWith("http") ? raw.previewImageUrl : `${API_BASE_URL}${raw.previewImageUrl}`)
            : undefined;
        const mapped = mapApiToCommissionDetail(raw, imageUrl);
        if (mapped) setData(mapped);
      }
      window.dispatchEvent(new Event("oc-commission-updated"));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message.trim() : "";
      alert(msg && msg.length < 300 ? msg : "取消失败，请稍后重试");
    } finally {
      setCancelPayLoading(false);
    }
  };

  const handleAcceptDelivery = async () => {
    if (!id || !token) return;
    setAcceptLoading(true);
    try {
      const res = await fetch(`/api/commissions/${id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.message
          ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
          : "验收失败";
        throw new Error(detail);
      }
      const detailRes = await fetch(`/api/commissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const raw = await detailRes.json();
        const imageUrl: string | undefined =
          typeof raw.previewImageUrl === "string" && raw.previewImageUrl.length > 0
            ? (raw.previewImageUrl.startsWith("http") ? raw.previewImageUrl : `${API_BASE_URL}${raw.previewImageUrl}`)
            : undefined;
        const mapped = mapApiToCommissionDetail(raw, imageUrl);
        if (mapped) setData(mapped);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message : "验收失败，请稍后重试";
      alert(msg);
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleRejectReview = async () => {
    if (!id || !token) return;
    setRejectReviewLoading(true);
    try {
      const res = await fetch(`/api/commissions/${id}/reject-review`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.message
          ? (Array.isArray(err.message) ? err.message.join("，") : String(err.message))
          : "操作失败";
        throw new Error(detail);
      }
      const detailRes = await fetch(`/api/commissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const raw = await detailRes.json();
        const imageUrl: string | undefined =
          typeof raw.previewImageUrl === "string" && raw.previewImageUrl.length > 0
            ? (raw.previewImageUrl.startsWith("http") ? raw.previewImageUrl : `${API_BASE_URL}${raw.previewImageUrl}`)
            : undefined;
        const mapped = mapApiToCommissionDetail(raw, imageUrl);
        if (mapped) setData(mapped);
      }
      setDeliveryFiles([]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message : "操作失败，请稍后重试";
      alert(msg);
    } finally {
      setRejectReviewLoading(false);
    }
  };

  const handleSubmitDeliveryFiles = async (files: File[], finalize: boolean) => {
    if (!id || !token) return;
    if (files.length === 0 && !finalize) return;
    setSubmitLoading(true);
    try {
      const uploaded: Array<{ name: string; url: string; relativePath?: string }> = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json().catch(() => ({}));
          const detail = uploadErr?.message
            ? (Array.isArray(uploadErr.message) ? uploadErr.message.join("，") : String(uploadErr.message))
            : "未知错误";
          throw new Error(`文件上传失败：${file.name}（${detail}）`);
        }
        const data = await uploadRes.json();
        uploaded.push({
          name: file.name,
          url: data?.url,
          relativePath: (file as any).webkitRelativePath || undefined,
        });
      }

      const res = await fetch(`/api/commissions/${id}/deliver`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ files: uploaded, finalize }),
      });
      if (!res.ok) {
        const deliverErr = await res.json().catch(() => ({}));
        const detail = deliverErr?.message
          ? (Array.isArray(deliverErr.message) ? deliverErr.message.join("，") : String(deliverErr.message))
          : "提交文件失败";
        throw new Error(detail);
      }
      const detailRes = await fetch(`/api/commissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const raw = await detailRes.json();
        const imageUrl: string | undefined =
          typeof raw.previewImageUrl === "string" && raw.previewImageUrl.length > 0
            ? (raw.previewImageUrl.startsWith("http") ? raw.previewImageUrl : `${API_BASE_URL}${raw.previewImageUrl}`)
            : undefined;
        const mapped = mapApiToCommissionDetail(raw, imageUrl);
        if (mapped) setData(mapped);
      }
      window.dispatchEvent(
        new CustomEvent("oc-commission-updated", { detail: { commissionId: Number(id) } }),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message : "提交失败，请稍后重试";
      alert(msg);
    } finally {
      setSubmitLoading(false);
    }
  };

  const busyPaymentAction = payLoading || cancelPayLoading;

  return (
    <>
    <div className="commission-detail-page">
      <div className="commission-detail-wrapper">
        <div className="commission-detail-main">
          <button className="commission-detail-back" onClick={handleBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            返回
          </button>

          <div className="commission-detail-card">
            <div className="commission-detail-header">
              <div className="commission-detail-header-main">
                <h1 className="commission-detail-title">
                  <span>{title}</span>
                  <span className="commission-detail-title-divider">|</span>
                  <span className="commission-detail-title-direction">{directionLabel}</span>
                </h1>
              </div>
              <div className="commission-detail-publisher">
                <div className="commission-detail-publisher-meta">
                  <button
                    type="button"
                    className="commission-detail-publisher-name-btn"
                    onClick={openPublisherProfile}
                    disabled={!publisherId}
                  >
                    <span className="commission-detail-publisher-name">{publisherName}</span>
                  </button>
                  <div className="commission-detail-publisher-speed">响应速度：{responseSpeed}</div>
                </div>
                <button
                  type="button"
                  className="commission-detail-publisher-avatar-btn"
                  onClick={openPublisherProfile}
                  disabled={!publisherId}
                  aria-label={`查看${publisherName}主页`}
                >
                  {publisherAvatar ? (
                    <img src={publisherAvatar} alt={publisherName} className="commission-detail-publisher-avatar" />
                  ) : (
                    <div className="commission-detail-publisher-avatar-placeholder" aria-hidden="true">
                      {publisherName.slice(0, 1)}
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="commission-detail-image-wrap">
              {previewImageUrl ? (
                <img src={previewImageUrl} alt={title} className="commission-detail-image" />
              ) : (
                <div className="commission-detail-image-placeholder">暂无封面图</div>
              )}
            </div>

            <div className="commission-detail-info-grid commission-detail-info-grid-extended">
              <div className="commission-detail-info-block">
                <div className="commission-detail-info-label">金额</div>
                <div className="commission-detail-info-value">
                  {amountText ? `¥${amountText}` : `¥${price.toLocaleString()}`}
                </div>
              </div>
              <div className="commission-detail-info-block">
                <div className="commission-detail-info-label">稿件类型</div>
                <div className="commission-detail-info-value">{typeText}</div>
              </div>
              <div className="commission-detail-info-block">
                <div className="commission-detail-info-label">发布时间</div>
                <div className="commission-detail-info-value">{formatDate(data.submittedAt)}</div>
              </div>
              <div className="commission-detail-info-block">
                <div className="commission-detail-info-label">交付时间</div>
                <div className="commission-detail-info-value">{metaValue("交付时间") ?? "-"}</div>
              </div>
              <div className="commission-detail-info-block">
                <div className="commission-detail-info-label">版权</div>
                <div className="commission-detail-info-value">{metaValue("版权") ?? "-"}</div>
              </div>
            </div>

            <div className="commission-detail-section">
              <div className="commission-detail-section-title">
                {direction === "offer" ? "接稿说明" : "需求说明"}
              </div>
              <p className="commission-detail-section-text">{parsedDescription.plainDescription || "暂无详细说明"}</p>
            </div>

            <div className="commission-detail-actions">
              {data.status === "done" ? (
                <p className="commission-detail-await-pay-hint" role="status">
                  已完成
                </p>
              ) : isPublisher ? (
                <>
                  {needsPublisherReopenPayment ? (
                    <>
                      <p className="commission-detail-await-pay-hint" role="status">
                        {payerName}已取消支付，稿件处于待确认。请重新确认以再次进入待支付；绑定关系仍保留。
                      </p>
                      <div className="commission-detail-review-actions-wrap">
                        <button
                          type="button"
                          className="commission-detail-danger-btn"
                          disabled={reopenApplyBusy}
                          onClick={() => setReopenApplyModal("reject")}
                        >
                          拒绝并回退新建
                        </button>
                        <button
                          type="button"
                          className="commission-detail-primary-btn"
                          disabled={reopenApplyBusy}
                          onClick={() => setReopenApplyModal("accept")}
                        >
                          重新确认并进入待支付
                        </button>
                      </div>
                    </>
                  ) : isPublisherAwaitingPaymentOnly ? (
                    <p className="commission-detail-await-pay-hint" role="status">
                      {`当前处于待支付阶段，请等待${payerName}完成支付。支付完成后将进入绘制与交付流程；此期间无法修改或删除稿件。`}
                    </p>
                  ) : canPublisherManageDelivery ? (
                    <>
                      <CommissionPublisherDeliveryList
                        commissionId={data.id}
                        token={token}
                        enabled={canPublisherManageDelivery}
                        allowRemove={data.status !== "review-pending"}
                        variant="detail"
                        onChanged={() => void fetchDetail()}
                      />
                      {canSubmitNow ? (
                        <CommissionDeliverySubmitButton
                          variant="detail"
                          isSubmitting={submitLoading}
                          onDeliver={(files, fin) => handleSubmitDeliveryFiles(files, fin)}
                        />
                      ) : (
                        <p className="commission-detail-await-pay-hint" role="status">
                          已发起验收，请等待{payerName}下载交付并验收。待验收阶段不可再移除已提交文件；若需修改请等待对方取消验收退回进行中。
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        className="commission-detail-primary-btn"
                        type="button"
                        onClick={() => navigate(`/commissions/${data.id}/edit`)}
                        disabled={!canPublisherEditOrDelete}
                        title={
                          !canPublisherEditOrDelete
                            ? "稿件进入进行中后不可修改"
                            : "编辑稿件"
                        }
                      >
                        {canPublisherEditOrDelete ? "编辑稿件" : "当前阶段不可编辑"}
                      </button>
                      <button
                        className="commission-detail-danger-btn"
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting || !canPublisherEditOrDelete}
                        title={
                          !canPublisherEditOrDelete ? "当前阶段不可删除" : "删除稿件"
                        }
                      >
                        {deleting ? "删除中..." : "删除稿件"}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {isPayer ? (
                    canAcceptNow ? (
                      <div className="commission-detail-review-actions-wrap">
                        <CommissionReviewPayerActions
                          variant="detail"
                          files={deliveryFiles}
                          isRejecting={rejectReviewLoading}
                          isAccepting={acceptLoading}
                          onRejectReview={handleRejectReview}
                          onAcceptDelivery={handleAcceptDelivery}
                        />
                      </div>
                    ) : payerAwaitingPublisherReopen ? (
                      <p className="commission-detail-await-pay-hint" role="status">
                        等待{publisherName}重新确认后，您可再次完成支付。
                      </p>
                    ) : canPayNow ? (
                      <>
                        <button
                          className="commission-detail-secondary-btn"
                          type="button"
                          onClick={() => setPaymentConfirmModal("cancel-pay")}
                          disabled={busyPaymentAction}
                        >
                          取消支付
                        </button>
                        <button
                          className="commission-detail-primary-btn"
                          type="button"
                          onClick={() => setPaymentConfirmModal("pay")}
                          disabled={busyPaymentAction}
                        >
                          立即支付
                        </button>
                      </>
                    ) : (
                      <button
                        className="commission-detail-primary-btn"
                        type="button"
                        onClick={undefined}
                        disabled
                      >
                        {data.paymentStatus === "paid" ? "已支付" : "当前不可支付"}
                      </button>
                    )
                  ) : (
                    <button
                      className="commission-detail-primary-btn"
                      type="button"
                      onClick={handleApply}
                      disabled={applyLoading || !canApplyNow || waitingPublisherConfirm}
                      title={waitingPublisherConfirm ? "发布方确认后可继续操作" : undefined}
                    >
                      {waitingPublisherConfirm
                        ? "等待确认"
                        : !canApplyNow
                          ? "当前不可申请"
                          : (applyLoading ? "发送中..." : (direction === "offer" ? "立即约他" : "申请接稿"))}
                    </button>
                  )}
                  <button
                    className="commission-detail-secondary-btn"
                    type="button"
                    onClick={handlePrivateChat}
                    disabled={chatLoading}
                  >
                    {chatLoading ? "跳转中..." : "私信沟通"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {paymentConfirmModal && (
      <div
        className="commission-apply-confirm-overlay"
        role="presentation"
        onClick={() => {
          if (busyPaymentAction) return;
          setPaymentConfirmModal(null);
        }}
      >
        <div
          className="commission-apply-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="commission-detail-pay-confirm-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="commission-apply-confirm-header">
            <h3 id="commission-detail-pay-confirm-title">
              {paymentConfirmModal === "cancel-pay" ? "取消支付" : "确认支付"}
            </h3>
            <button
              type="button"
              className="commission-apply-confirm-close"
              disabled={busyPaymentAction}
              aria-label="关闭"
              onClick={() => setPaymentConfirmModal(null)}
            >
              ×
            </button>
          </div>
          <p className="commission-apply-confirm-body">
            {paymentConfirmModal === "cancel-pay"
              ? "确定取消支付？稿件将退回「待确认」，绑定保留；需由发布方重新确认后，支付方才可再次付款。"
              : "确定完成支付？支付成功后稿件将进入「进行中」，发布方可开始交付；请确认金额与约定无误。"}
          </p>
          <div className="commission-apply-confirm-footer">
            <button
              type="button"
              className="commission-apply-confirm-cancel"
              disabled={busyPaymentAction}
              onClick={() => setPaymentConfirmModal(null)}
            >
              返回
            </button>
            {paymentConfirmModal === "cancel-pay" ? (
              <button
                type="button"
                className="commission-apply-confirm-danger"
                disabled={busyPaymentAction}
                onClick={() => {
                  setPaymentConfirmModal(null);
                  void handleCancelPayment();
                }}
              >
                {cancelPayLoading ? "处理中..." : "确定取消"}
              </button>
            ) : (
              <button
                type="button"
                className="commission-apply-confirm-primary"
                disabled={busyPaymentAction}
                onClick={() => {
                  setPaymentConfirmModal(null);
                  void handlePay();
                }}
              >
                {payLoading ? "处理中..." : "确定支付"}
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {reopenApplyModal && needsPublisherReopenPayment && (
      <div
        className="commission-apply-confirm-overlay"
        role="presentation"
        onClick={() => {
          if (reopenApplyBusy) return;
          setReopenApplyModal(null);
        }}
      >
        <div
          className="commission-apply-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="commission-detail-reopen-apply-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="commission-apply-confirm-header">
            <h3 id="commission-detail-reopen-apply-title">
              {reopenApplyModal === "reject" ? "拒绝承接" : "重新进入待支付"}
            </h3>
            <button
              type="button"
              className="commission-apply-confirm-close"
              disabled={reopenApplyBusy}
              aria-label="关闭"
              onClick={() => setReopenApplyModal(null)}
            >
              ×
            </button>
          </div>
          <p className="commission-apply-confirm-body">
            {reopenApplyModal === "reject"
              ? "确定拒绝吗？稿件将恢复为新建状态，与当前承接方的绑定将解除。"
              : "确定后稿件将再次进入「待支付」，对方可完成支付；承接关系不变。"}
          </p>
          <div className="commission-apply-confirm-footer">
            <button
              type="button"
              className="commission-apply-confirm-cancel"
              disabled={reopenApplyBusy}
              onClick={() => setReopenApplyModal(null)}
            >
              返回
            </button>
            {reopenApplyModal === "reject" ? (
              <button
                type="button"
                className="commission-apply-confirm-danger"
                disabled={reopenApplyBusy}
                onClick={() => void handleReopenPaymentReject()}
              >
                {reopenApplyBusy ? "处理中..." : "确定拒绝"}
              </button>
            ) : (
              <button
                type="button"
                className="commission-apply-confirm-primary"
                disabled={reopenApplyBusy}
                onClick={() => void handleReopenPaymentConfirm()}
              >
                {reopenApplyBusy ? "处理中..." : "确定重新确认"}
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

