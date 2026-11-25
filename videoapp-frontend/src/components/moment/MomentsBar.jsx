
import { useMemo } from "react";
import { Plus, UserRound } from "lucide-react";

function getId(value) {
  return String(value?._id || value?.id || "");
}

function getOwner(moment) {
  return moment?.owner && typeof moment.owner === "object"
    ? moment.owner
    : {};
}

function getName(user) {
  return user?.fullName || user?.username || "User";
}

function getUsername(user) {
  return String(user?.username || "").replace(/^@+/, "");
}

function getAvatar(user) {
  return user?.avatar || user?.avatarUrl || "";
}

function groupMomentsByOwner(moments) {
  const groups = new Map();

  moments.forEach((moment) => {
    const owner = getOwner(moment);

    const ownerId =
      getId(owner) ||
      (typeof moment?.owner === "string"
        ? moment.owner
        : "");

    if (!ownerId) return;

    if (!groups.has(ownerId)) {
      groups.set(ownerId, {
        key: ownerId,
        owner,
        items: [],
      });
    }

    groups.get(ownerId).items.push(moment);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
      ),
    }))
    .sort((a, b) => {
      const latestA = new Date(
        a.items[a.items.length - 1]?.createdAt || 0
      ).getTime();

      const latestB = new Date(
        b.items[b.items.length - 1]?.createdAt || 0
      ).getTime();

      return latestB - latestA;
    });
}

function Avatar({
  user,
  className = "h-16 w-16",
}) {
  const avatar = getAvatar(user);

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#191922]`}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={getName(user)}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <UserRound
          size={24}
          className="text-white/60"
        />
      )}
    </span>
  );
}

function hasUnseenMoments(items = []) {
  return items.some(
    (moment) => moment?.isViewed !== true
  );
}

export default function MomentsBar({
  user,
  moments = [],
  loading = false,
  error = "",
  onCreate,
  onOpen,
  onRetry,
}) {
  const groups = useMemo(
    () => groupMomentsByOwner(moments),
    [moments]
  );

  const myGroup = useMemo(() => {
    const userId = getId(user);
    const username = getUsername(user).toLowerCase();

    return (
      groups.find((group) => {
        return (
          (userId && group.key === userId) ||
          (username &&
            getUsername(group.owner).toLowerCase() ===
              username)
        );
      }) || null
    );
  }, [groups, user]);

  const otherGroups = groups.filter(
    (group) => group.key !== myGroup?.key
  );

  const myHasUnseen = myGroup
    ? hasUnseenMoments(myGroup.items)
    : true;

  return (
    <section
      className="mb-6"
      aria-label="Moments"
    >
      <h2 className="mb-3 text-base font-semibold text-white">
        Moments
      </h2>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-4">
          <p className="text-xs text-red-300">
            {error}
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 text-xs text-violet-300 hover:text-violet-200"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-4 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Your Moment */}
          <div className="relative flex w-[66px] shrink-0 flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (myGroup) {
                  onOpen?.(myGroup.items, myGroup.owner, 0);
                } else {
                  onCreate?.();
                }
              }}
              aria-label={
                myGroup
                  ? "View your Moments"
                  : "Create your first Moment"
              }
              className={`rounded-full p-[2px] transition-all duration-500 hover:scale-105 ${
                myHasUnseen
                  ? "bg-gradient-to-br from-violet-500 to-indigo-500"
                  : "bg-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
              }`}
            >
              <span className="flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full border-2 border-[#08090d] bg-[#191922]">
                <Avatar
                  user={user || {}}
                  className="h-full w-full"
                />
              </span>
            </button>

            <button
              type="button"
              onClick={onCreate}
              aria-label="Add a Moment"
              title="Add Moment"
              className="absolute right-0 top-[41px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#08090d] bg-violet-500 text-white hover:bg-violet-400"
            >
              <Plus size={12} strokeWidth={2.5} />
            </button>

            <span className="w-full truncate text-center text-[11px] text-white/65">
              Your moment
            </span>
          </div>

          {/* Loading placeholders */}
          {loading &&
            [1, 2, 3].map((item) => (
              <div
                key={item}
                className="flex w-[66px] shrink-0 flex-col items-center gap-2"
              >
                <div className="h-[62px] w-[62px] animate-pulse rounded-full bg-white/[0.07]" />
                <div className="h-3 w-12 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}

          {/* Followed users' Moments */}
          {!loading &&
            otherGroups.map((group) => {
              const unseen = hasUnseenMoments(group.items);

              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() =>
                    onOpen?.(group.items, group.owner, 0)
                  }
                  title={getName(group.owner)}
                  className="flex w-[66px] shrink-0 flex-col items-center gap-2"
                >
                  <span
                    className={`rounded-full p-[2px] transition-all duration-500 hover:scale-105 ${
                      unseen
                        ? "bg-gradient-to-br from-fuchsia-500 via-violet-500 to-amber-400"
                        : "bg-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
                    }`}
                  >
                    <span className="flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full border-2 border-[#08090d] bg-[#191922]">
                      <Avatar
                        user={group.owner}
                        className="h-full w-full"
                      />
                    </span>
                  </span>

                  <span className="w-full truncate text-center text-[11px] text-white/65">
                    {getUsername(group.owner) ||
                      getName(group.owner)}
                  </span>
                </button>
              );
            })}

          {!loading && otherGroups.length === 0 && (
            <p className="self-center py-5 text-xs text-white/40">
              No Moments from followed users yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
