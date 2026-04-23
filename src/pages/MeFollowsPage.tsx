import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AuthPromptPanel } from "../components/auth/AuthPromptPanel";
import { resolveApiUrl } from "../config/api";

interface FollowUser {
  id: number;
  username: string;
  avatarUrl: string | null;
}

type FollowTab = "following" | "followers";

export default function MeFollowsPage() {
  const { user, token, isReady } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [followingList, setFollowingList] = useState<FollowUser[]>([]);
  const [followersList, setFollowersList] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const tabParam = searchParams.get("tab");
  const activeTab: FollowTab = tabParam === "followers" ? "followers" : "following";

  useEffect(() => {
    if (!token || !user) return;
    const run = async () => {
      setLoading(true);
      try {
        const [followingRes, followersRes] = await Promise.all([
          fetch("/api/users/me/following", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/users/me/followers", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (followingRes.ok) {
          const followingData = await followingRes.json();
          setFollowingList(Array.isArray(followingData) ? followingData : []);
        }
        if (followersRes.ok) {
          const followersData = await followersRes.json();
          setFollowersList(Array.isArray(followersData) ? followersData : []);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token, user]);

  if (!isReady) return null;
  if (!user) {
    return (
      <div className="oc-auth-gate-page">
        <div className="oc-auth-gate-page__inner">
          <AuthPromptPanel title="登录后查看关注与粉丝" description="登录后可管理关注列表、查看粉丝，并快速访问对方主页。" />
        </div>
      </div>
    );
  }

  const followingSet = useMemo(
    () => new Set(followingList.map((u) => u.id)),
    [followingList],
  );

  const source = activeTab === "following" ? followingList : followersList;
  const filtered = source.filter((u) => u.username.toLowerCase().includes(keyword.trim().toLowerCase()));

  const handleToggleFollow = async (targetUserId: number, currentlyFollowing: boolean) => {
    if (!token || processingId != null) return;
    setProcessingId(targetUserId);
    try {
      const method = currentlyFollowing ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${targetUserId}/follow`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      if (currentlyFollowing) {
        setFollowingList((prev) => prev.filter((u) => u.id !== targetUserId));
      } else {
        const targetInFollowers = followersList.find((u) => u.id === targetUserId);
        if (targetInFollowers) {
          setFollowingList((prev) => [targetInFollowers, ...prev]);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const switchTab = (tab: FollowTab) => {
    setSearchParams({ tab });
  };

  return (
    <div className="me-follows-page">
      <div className="me-follows-layout">
        <aside className="me-follows-sidebar">
          <h2 className="me-follows-sidebar-title">关系</h2>
          <p className="me-follows-sidebar-desc">管理关注与粉丝</p>
          <button
            type="button"
            className={`me-follows-sidebar-item ${activeTab === "following" ? "active" : ""}`}
            onClick={() => switchTab("following")}
          >
            <span className="me-follows-sidebar-label">全部关注</span>
            <span className="me-follows-sidebar-count">{followingList.length}</span>
          </button>
          <button
            type="button"
            className={`me-follows-sidebar-item ${activeTab === "followers" ? "active" : ""}`}
            onClick={() => switchTab("followers")}
          >
            <span className="me-follows-sidebar-label">我的粉丝</span>
            <span className="me-follows-sidebar-count">{followersList.length}</span>
          </button>
          <button
            type="button"
            className="me-follows-sidebar-back"
            onClick={() => navigate("/me")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回我的主页
          </button>
        </aside>

        <section className="me-follows-main">
          <div className="me-follows-main-header">
            <div className="me-follows-main-title-wrap">
              <h1>{activeTab === "following" ? "全部关注" : "我的粉丝"}</h1>
              <p className="me-follows-main-sub">
                {activeTab === "following"
                  ? "共 " + followingList.length + " 人"
                  : "共 " + followersList.length + " 人"}
              </p>
            </div>
            <div className="me-follows-search-wrap">
              <svg className="me-follows-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                className="me-follows-search"
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索用户名"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </div>

          {loading ? (
            <div className="me-follows-state me-follows-state--loading" role="status">
              <span className="me-follows-spinner" aria-hidden />
              <span>加载中…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="me-follows-state me-follows-state--empty" role="status">
              <p className="me-follows-state-title">
                {keyword.trim() ? "没有匹配的用户" : activeTab === "following" ? "还没有关注任何人" : "暂时还没有粉丝"}
              </p>
              <p className="me-follows-state-hint">
                {keyword.trim()
                  ? "换个关键词试试"
                  : activeTab === "following"
                    ? "去发现页逛逛，关注喜欢的作者吧"
                    : "发布优质作品更容易获得关注"}
              </p>
            </div>
          ) : (
            <div className="me-follows-list">
              {filtered.map((u) => {
                const normalizedAvatar = u.avatarUrl
                  ? resolveApiUrl(u.avatarUrl)
                  : null;
                const isFollowing = followingSet.has(u.id);
                return (
                  <div key={u.id} className="me-follows-item">
                    <button
                      type="button"
                      className="me-follows-item-user"
                      onClick={() => navigate(`/user/${u.id}`)}
                    >
                      {normalizedAvatar ? (
                        <img src={normalizedAvatar} alt={u.username} className="me-follows-avatar" />
                      ) : (
                        <div className="me-follows-avatar-placeholder">{u.username.charAt(0).toUpperCase()}</div>
                      )}
                      <div className="me-follows-user-info">
                        <div className="me-follows-username">{u.username}</div>
                        <div className="me-follows-subtext">
                          {activeTab === "following" ? "你已关注该用户" : "关注后可更方便查看动态"}
                        </div>
                      </div>
                    </button>
                    <div className="me-follows-actions">
                      <button
                        type="button"
                        className="me-follows-btn secondary"
                        onClick={() => navigate(`/user/${u.id}`)}
                      >
                        主页
                      </button>
                      <button
                        type="button"
                        className={`me-follows-btn ${isFollowing ? "danger" : "primary"}`}
                        disabled={processingId === u.id}
                        onClick={() => handleToggleFollow(u.id, isFollowing)}
                      >
                        {processingId === u.id ? "处理中..." : isFollowing ? "取消关注" : "回关"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

