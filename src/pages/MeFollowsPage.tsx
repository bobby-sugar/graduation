import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface FollowUser {
  id: number;
  username: string;
  avatarUrl: string | null;
}

type FollowTab = "following" | "followers";

const API_BASE_URL = "http://localhost:3000";

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
  if (!user) return <Navigate to="/login?from=/me/follows" replace />;

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
          <h2 className="me-follows-sidebar-title">关系管理</h2>
          <button
            type="button"
            className={`me-follows-sidebar-item ${activeTab === "following" ? "active" : ""}`}
            onClick={() => switchTab("following")}
          >
            全部关注
            <span>{followingList.length}</span>
          </button>
          <button
            type="button"
            className={`me-follows-sidebar-item ${activeTab === "followers" ? "active" : ""}`}
            onClick={() => switchTab("followers")}
          >
            我的粉丝
            <span>{followersList.length}</span>
          </button>
          <button
            type="button"
            className="me-follows-sidebar-back"
            onClick={() => navigate("/me")}
          >
            返回我的主页
          </button>
        </aside>

        <section className="me-follows-main">
          <div className="me-follows-main-header">
            <h1>{activeTab === "following" ? "全部关注" : "我的粉丝"}</h1>
            <input
              className="me-follows-search"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="输入用户名搜索"
            />
          </div>

          {loading ? (
            <div className="me-follows-empty">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="me-follows-empty">暂无数据</div>
          ) : (
            <div className="me-follows-list">
              {filtered.map((u) => {
                const normalizedAvatar = u.avatarUrl
                  ? (u.avatarUrl.startsWith("http") ? u.avatarUrl : `${API_BASE_URL}${u.avatarUrl}`)
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

