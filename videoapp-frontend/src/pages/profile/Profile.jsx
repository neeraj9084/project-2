import { useNavigate, useParams } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Check,
  MoreHorizontal,
  Pencil,
  X,
  LoaderCircle,
  Video,
  Eye,
  CalendarDays,
  UserRound,
  RefreshCw,
  MapPin,
  ExternalLink,
  Plus,
  Play,
  Users,
  UserPlus,
  Search,
} from "lucide-react";

import {
  getCurrentUser,
  getPublicProfile,
  updateAccountDetails,
  updateAvatar,
  updateCoverImage,
} from "../../services/user/userApi";

import {
  followUser,
  unfollowUser,
  getMySubscriptions,
  getChannelFollowers,
} from "../../services/subscribe/subscribeApi";

import { getMyVideos } from "../../services/video/videoApi";
import { useMoments } from "../../hooks/useMoments";
import MomentViewer from "../../components/moment/MomentViewer";
import ProfileAvatar from "../../components/profile/ProfileAvatar.jsx";
import ProfileCover from "../../components/profile/ProfileCover.jsx";

/* -------------------------------------------------------
   Helper functions
------------------------------------------------------- */

function getId(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return String(value?._id || value?.id || "");
}

function unwrapResponse(response) {
  return response?.data?.data ?? response?.data ?? response;
}

function unwrapUser(response) {
  const result = unwrapResponse(response);

  return (
    result?.user ||
    result?.data?.user ||
    result?.data ||
    result
  );
}

function getVideoArray(response) {
  const result = unwrapResponse(response);

  const options = [
    result,
    result?.videos,
    result?.docs,
    result?.data,
    result?.data?.videos,
    result?.data?.docs,
    result?.results,
  ];

  return options.find(Array.isArray) || [];
}

function formatJoinedDate(date) {
  if (!date) return "";

  const value = new Date(date);

  if (Number.isNaN(value.getTime())) return "";

  return `Joined ${value.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  })}`;
}

function formatDuration(duration) {
  const total = Math.max(0, Math.floor(Number(duration) || 0));

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getWebsiteUrl(website) {
  const value = String(website || "").trim();

  if (!value) return "";

  return /^https?:\/\//i.test(value)
    ? value
    : `https://${value}`;
}

function getPersonName(person) {
  return (
    person?.fullName ||
    person?.username ||
    person?.name ||
    "User"
  );
}

function getPersonUsername(person) {
  return String(person?.username || "").replace(/^@+/, "");
}

function getPersonAvatar(person) {
  return person?.avatar || person?.avatarUrl || "";
}

/* -------------------------------------------------------
   Profile video card
------------------------------------------------------- */

function ProfileVideoCard({ video, onOpen }) {
  const playerRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);

  const thumbnail =
    video.thumbnail ||
    video.thumbnailUrl ||
    video.thumbnailURL ||
    "";

  const videoUrl =
    video.videoFile ||
    video.videoUrl ||
    video.videoURL ||
    video.url ||
    "";

  const title = video.title || "Untitled video";

  const handleMouseEnter = async () => {
    const player = playerRef.current;

    if (!player || !videoUrl) return;

    player.muted = true;
    player.playsInline = true;

    try {
      await player.play();
      setPreviewing(true);
    } catch {
      setPreviewing(false);
    }
  };

  const handleMouseLeave = () => {
    const player = playerRef.current;

    if (player) {
      player.pause();

      try {
        if (player.readyState > 0) {
          player.currentTime = 0;
        }
      } catch {
        // Video metadata may not have loaded yet.
      }
    }

    setPreviewing(false);
  };

  return (
    <article className="group min-w-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Watch ${title}`}
        className="block w-full text-left"
      >
        <div
          className="relative aspect-video overflow-hidden rounded-xl bg-gray-100"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={title}
              loading="lazy"
              draggable="false"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No thumbnail available
            </div>
          )}

          {videoUrl && (
            <video
              ref={playerRef}
              src={videoUrl}
              poster={thumbnail || undefined}
              muted
              loop
              playsInline
              preload="none"
              onPlaying={() => setPreviewing(true)}
              onError={() => setPreviewing(false)}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity ${
                previewing ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {video.duration != null && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-2 py-1 text-xs font-semibold text-white">
              {formatDuration(video.duration)}
            </span>
          )}

          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:bg-black/10 group-hover:opacity-100">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
              <Play size={18} fill="currentColor" />
            </span>
          </span>
        </div>

        <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-gray-900 group-hover:text-violet-700">
          {title}
        </h3>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <Eye size={14} />
          {Number(video.views ?? 0).toLocaleString("en-IN")} views
        </span>

        {video.createdAt && (
          <span>
            {new Date(video.createdAt).toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------
   Followers / following person row
------------------------------------------------------- */

function PersonListItem({ person, onClick }) {
  const name = getPersonName(person);
  const username = getPersonUsername(person);
  const avatar = getPersonAvatar(person);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-gray-50"
    >
      {avatar ? (
        <img
          src={avatar}
          alt={name}
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-full border border-gray-100 object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <UserRound size={22} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">
          {name}
        </p>

        {username && (
          <p className="mt-0.5 truncate text-xs text-gray-500">
            @{username}
          </p>
        )}
      </div>

      <span className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700">
        View
      </span>
    </button>
  );
}

/* -------------------------------------------------------
   Profile page
------------------------------------------------------- */

export default function Profile() {
  const navigate = useNavigate();
  const { userId } = useParams();

  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);

  const [isOwnProfile, setIsOwnProfile] = useState(!userId);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [activeTab, setActiveTab] = useState("videos");
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false);
  const [activeMomentViewer, setActiveMomentViewer] = useState(null);

  const [cropEditor, setCropEditor] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropDragging, setCropDragging] = useState(false);

  const cropDragStart = useRef(null);
  const cropFrameRef = useRef(null);
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const [avatarPreview, setAvatarPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");

  const [peopleModal, setPeopleModal] = useState({
    open: false,
    type: "followers",
  });

  const [peopleList, setPeopleList] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    bio: "",
  });

  const viewerId = isOwnProfile ? getId(user) : "";

  const {
    moments: myMoments = [],
    loading: momentsLoading,
    markAsViewed,
  } = useMoments({
    mode: "mine",
    viewerId,
  });

  /* -----------------------------------------------------
     Preview URL cleanup
  ----------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }

      if (coverPreview.startsWith("blob:")) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [avatarPreview, coverPreview]);

  /* -----------------------------------------------------
     Load profile
  ----------------------------------------------------- */

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      if (userId) {
        const response = await getPublicProfile(userId);
        const result = unwrapResponse(response);

        const publicUser =
          result?.user ||
          result?.data?.user;

        if (!publicUser || !getId(publicUser)) {
          throw new Error("Creator profile could not be loaded.");
        }

        setUser({
          ...publicUser,
          stats: result?.stats || publicUser.stats || {},
        });

        setIsOwnProfile(Boolean(result?.isOwnProfile));
        setVideos(getVideoArray(result?.videos));
        setVideosLoading(false);
      } else {
        const currentUser = unwrapUser(await getCurrentUser());

        if (!currentUser || !getId(currentUser)) {
          throw new Error("User information could not be loaded.");
        }

        setUser(currentUser);
        setIsOwnProfile(true);
      }
    } catch (err) {
      setUser(null);
      setVideos([]);
      setIsOwnProfile(false);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load profile."
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /* -----------------------------------------------------
     Load own videos
  ----------------------------------------------------- */

  const loadVideos = useCallback(async () => {
    try {
      setVideosLoading(true);

      const response = await getMyVideos();
      setVideos(getVideoArray(response));
    } catch (err) {
      console.error("Unable to load videos:", err);
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();

    if (!userId) {
      loadVideos();
    }

    return undefined;
  }, [loadProfile, loadVideos, userId]);

  /* -----------------------------------------------------
     Load actual follower / following counts
  ----------------------------------------------------- */

  useEffect(() => {
    const profileId = getId(user);

    if (!profileId) return undefined;

    let cancelled = false;

    const loadFollowersCount = async () => {
      try {
        const response = await getChannelFollowers(profileId, {
          page: 1,
          limit: 1,
        });

        const result = unwrapResponse(response);

        const rawCount =
          result?.pagination?.totalSubscribers ??
          result?.totalSubscribers;

        if (
          cancelled ||
          rawCount === undefined ||
          rawCount === null
        ) {
          return;
        }

        const count = Number(rawCount);

        if (!Number.isFinite(count)) return;

        setUser((previous) => {
          if (!previous || getId(previous) !== profileId) {
            return previous;
          }

          return {
            ...previous,
            followersCount: count,
            stats: {
              ...(previous.stats || {}),
              followers: count,
            },
          };
        });
      } catch (err) {
        console.error(
          "Unable to load follower count:",
          err?.response?.data || err?.message
        );
      }
    };

    const loadFollowingCount = async () => {
      // This API returns subscriptions for the logged-in user only.
      if (!isOwnProfile) return;

      try {
        const response = await getMySubscriptions({
          page: 1,
          limit: 1,
        });

        const result = unwrapResponse(response);

        const rawCount =
          result?.pagination?.totalSubscriptions ??
          result?.totalSubscriptions;

        if (
          cancelled ||
          rawCount === undefined ||
          rawCount === null
        ) {
          return;
        }

        const count = Number(rawCount);

        if (!Number.isFinite(count)) return;

        setUser((previous) => {
          if (!previous || getId(previous) !== profileId) {
            return previous;
          }

          return {
            ...previous,
            followingCount: count,
            stats: {
              ...(previous.stats || {}),
              following: count,
            },
          };
        });
      } catch (err) {
        console.error(
          "Unable to load following count:",
          err?.response?.data || err?.message
        );
      }
    };

    loadFollowersCount();
    loadFollowingCount();

    return () => {
      cancelled = true;
    };
  }, [user?._id, user?.id, isOwnProfile]);

  /* -----------------------------------------------------
     Check follow status
  ----------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const loadFollowStatus = async () => {
      if (!userId || !getId(user) || isOwnProfile) {
        setIsFollowing(false);
        return;
      }

      try {
        const response = await getMySubscriptions();
        const result = unwrapResponse(response);

        const subscriptions = Array.isArray(result)
          ? result
          : result?.subscriptions ||
            result?.docs ||
            result?.results ||
            result?.data ||
            [];

        const following = subscriptions.some((item) => {
          const channelId =
            item?.channel?._id ||
            item?.channel?.id ||
            item?.channelId?._id ||
            item?.channelId ||
            item?.channel;

          return String(channelId) === getId(user);
        });

        if (!cancelled) {
          setIsFollowing(following);
        }
      } catch (err) {
        console.error("Error loading follow status:", err);
      }
    };

    loadFollowStatus();

    return () => {
      cancelled = true;
    };
  }, [userId, user?._id, user?.id, isOwnProfile]);

  /* -----------------------------------------------------
     Follow / unfollow
  ----------------------------------------------------- */

  const handleFollowToggle = async () => {
    const targetUserId = getId(user);

    if (!targetUserId || isOwnProfile || followLoading) {
      return;
    }

    try {
      setFollowLoading(true);
      setError("");

      if (isFollowing) {
        await unfollowUser(targetUserId);
        setIsFollowing(false);
      } else {
        await followUser(targetUserId);
        setIsFollowing(true);
      }

      setUser((previous) => {
        if (!previous) return previous;

        const oldFollowers = Number(
          previous.stats?.followers ??
            previous.followersCount ??
            0
        );

        const followers = Math.max(
          0,
          oldFollowers + (isFollowing ? -1 : 1)
        );

        return {
          ...previous,
          followersCount: followers,
          stats: {
            ...(previous.stats || {}),
            followers,
          },
        };
      });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to update follow status."
      );
    } finally {
      setFollowLoading(false);
    }
  };

  /* -----------------------------------------------------
     Load followers / following list
  ----------------------------------------------------- */

  const openPeopleList = async (type) => {
    const profileId = getId(user);

    if (!profileId) {
      setPeopleModal({
        open: true,
        type,
      });
      setPeopleError("Profile ID nahi mila.");
      return;
    }

    setPeopleModal({
      open: true,
      type,
    });

    setPeopleList([]);
    setPeopleError("");
    setPeopleSearch("");
    setPeopleLoading(true);

    try {
      if (type === "followers") {
        const response = await getChannelFollowers(profileId, {
          page: 1,
          limit: 100,
        });

        const result = unwrapResponse(response);

        const subscribers = Array.isArray(result)
          ? result
          : result?.subscribers ||
            result?.data?.subscribers ||
            result?.docs ||
            result?.results ||
            [];

        const followers = subscribers
          .map((item) => item?.subscriber || item?.user || item)
          .filter((person) => person && getId(person));

        setPeopleList(followers);
      } else {
        // The existing endpoint only returns the logged-in user's
        // subscriptions. It cannot fetch another user's following list.
        if (!isOwnProfile) {
          setPeopleError(
            "Dusre users ki Following list ke liye backend API support chahiye."
          );
          return;
        }

        const response = await getMySubscriptions({
          page: 1,
          limit: 100,
        });

        const result = unwrapResponse(response);

        const subscriptions = Array.isArray(result)
          ? result
          : result?.subscriptions ||
            result?.docs ||
            result?.results ||
            [];

        const following = subscriptions
          .map(
            (item) =>
              item?.channel ||
              item?.subscribedTo ||
              item?.user
          )
          .filter((person) => person && getId(person));

        setPeopleList(following);
      }
    } catch (err) {
      console.error(
        "Unable to load people list:",
        err?.response?.data || err?.message
      );

      setPeopleError(
        err?.response?.data?.message ||
          err?.message ||
          "List load nahi ho paayi. Dobara try karo."
      );
    } finally {
      setPeopleLoading(false);
    }
  };

  const closePeopleModal = () => {
    setPeopleModal({
      open: false,
      type: "followers",
    });

    setPeopleList([]);
    setPeopleError("");
    setPeopleSearch("");
  };

  useEffect(() => {
    if (!peopleModal.open) return undefined;

    const oldOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closePeopleModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [peopleModal.open]);

  const filteredPeople = peopleList.filter((person) => {
    const search = peopleSearch.trim().toLowerCase();

    if (!search) return true;

    const name = getPersonName(person).toLowerCase();
    const username = getPersonUsername(person).toLowerCase();

    return name.includes(search) || username.includes(search);
  });

  /* -----------------------------------------------------
     Notifications
  ----------------------------------------------------- */

  useEffect(() => {
    if (!success && !error) return undefined;

    const timer = window.setTimeout(() => {
      setSuccess("");
      setError("");
    }, success ? 2500 : 5000);

    return () => window.clearTimeout(timer);
  }, [success, error]);

  /* -----------------------------------------------------
     Edit dialog keyboard and scroll handling
  ----------------------------------------------------- */

  useEffect(() => {
    if (!isEditOpen) return undefined;

    const oldOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) {
        setIsEditOpen(false);
        setError("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditOpen, saving]);

  /* -----------------------------------------------------
     Edit profile
  ----------------------------------------------------- */

  const openEditProfile = () => {
    if (!user || !isOwnProfile) return;

    setFormData({
      fullName: user.fullName || "",
      username: String(user.username || "").replace(/^@+/, ""),
      bio: user.bio || "",
    });

    setError("");
    setSuccess("");
    setIsEditOpen(true);
  };

  const closeEditProfile = () => {
    if (saving) return;

    setIsEditOpen(false);
    setError("");
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: name === "bio" ? value.slice(0, 150) : value,
    }));
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();

    if (!isOwnProfile) return;

    const fullName = formData.fullName.trim();

    const username = formData.username
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();

    const bio = formData.bio.trim();

    if (!fullName || !username) {
      setError("Please enter your full name and username.");
      return;
    }

    if (!/^[a-zA-Z0-9_.@]+$/.test(username)) {
      setError(
        "Username may contain letters, numbers, underscores, @ and periods."
      );
      return;
    }

    if (bio.length > 150) {
      setError("Bio cannot exceed 150 characters.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await updateAccountDetails({
        fullName,
        username,
        bio,
      });

      const updatedUser = unwrapUser(response);

      setUser((previous) => ({
        ...previous,
        ...(updatedUser && typeof updatedUser === "object"
          ? updatedUser
          : {}),
        fullName,
        username,
        bio,
      }));

      setIsEditOpen(false);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to update profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  /* -----------------------------------------------------
     Image upload and crop editor
  ----------------------------------------------------- */

  const handleImageUpload = (event, type) => {
    if (!isOwnProfile) return;

    const input = event.currentTarget;
    const file = input.files?.[0];

    input.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be 10 MB or less.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setCropEditor({
      file,
      type,
      previewUrl,
    });

    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setError("");
    setSuccess("");
  };

  const closeCropEditor = () => {
    if (!cropEditor) return;

    if (uploadingAvatar || uploadingCover) return;

    URL.revokeObjectURL(cropEditor.previewUrl);

    setCropEditor(null);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setCropDragging(false);

    cropDragStart.current = null;
  };

  const saveCroppedImage = async () => {
    if (!cropEditor || !isOwnProfile) return;

    const { type, previewUrl } = cropEditor;
    const isAvatar = type === "avatar";

    const setUploading = isAvatar
      ? setUploadingAvatar
      : setUploadingCover;

    const setPreview = isAvatar
      ? setAvatarPreview
      : setCoverPreview;

    const uploadFunction = isAvatar
      ? updateAvatar
      : updateCoverImage;

    let croppedPreview = "";

    try {
      setUploading(true);
      setError("");
      setSuccess("");

      const image = new Image();
      image.src = previewUrl;

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => {
          reject(new Error("Unable to read selected image."));
        };
      });

      const frame = cropFrameRef.current;

      const frameWidth =
        frame?.clientWidth || (isAvatar ? 256 : 700);

      const frameHeight =
        frame?.clientHeight || (isAvatar ? 256 : 233);

      const outputWidth = isAvatar ? 800 : 1800;
      const outputHeight = isAvatar ? 800 : 600;

      const canvas = document.createElement("canvas");

      canvas.width = outputWidth;
      canvas.height = outputHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Image editor is unavailable.");
      }

      const baseScale = Math.max(
        outputWidth / image.naturalWidth,
        outputHeight / image.naturalHeight
      );

      const scale = baseScale * cropZoom;

      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;

      const baseX = (outputWidth - drawWidth) / 2;
      const baseY = (outputHeight - drawHeight) / 2;

      const offsetX =
        (cropOffset.x / Math.max(frameWidth, 1)) * outputWidth;

      const offsetY =
        (cropOffset.y / Math.max(frameHeight, 1)) * outputHeight;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputWidth, outputHeight);

      context.save();

      context.beginPath();
      context.rect(0, 0, outputWidth, outputHeight);
      context.clip();

      context.drawImage(
        image,
        baseX + offsetX,
        baseY + offsetY,
        drawWidth,
        drawHeight
      );

      context.restore();

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) {
              resolve(result);
            } else {
              reject(new Error("Could not crop the image."));
            }
          },
          "image/jpeg",
          0.92
        );
      });

      const croppedFile = new File(
        [blob],
        `${type}-cropped.jpg`,
        { type: "image/jpeg" }
      );

      croppedPreview = URL.createObjectURL(croppedFile);

      const response = await uploadFunction(croppedFile);
      const updatedUser = unwrapUser(response);

      setUser((previous) => ({
        ...previous,
        ...(updatedUser && typeof updatedUser === "object"
          ? updatedUser
          : {}),
      }));

      setPreview(croppedPreview);
      croppedPreview = "";

      closeCropEditor();

      setSuccess(
        isAvatar
          ? "Profile photo updated."
          : "Cover image updated."
      );
    } catch (err) {
      if (croppedPreview) {
        URL.revokeObjectURL(croppedPreview);
      }

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to upload image. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  /* -----------------------------------------------------
     Moments
  ----------------------------------------------------- */

  const openOwnMoments = () => {
    if (
      !isOwnProfile ||
      momentsLoading ||
      !myMoments.length
    ) {
      return;
    }

    setActiveMomentViewer({
      moments: myMoments,
      owner: user,
      initialIndex: 0,
    });
  };

  /* -----------------------------------------------------
     Loading and error screens
  ----------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#f8fafc] text-gray-600">
        <LoaderCircle className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center text-gray-900">
        <UserRound className="mx-auto mb-4 h-12 w-12 text-gray-400" />

        <h2 className="text-xl font-semibold">
          Unable to load profile
        </h2>

        <p className="mt-2 text-sm text-gray-600">
          {error || "Please try again."}
        </p>

        <button
          type="button"
          onClick={loadProfile}
          className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 font-medium text-white hover:bg-violet-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  /* -----------------------------------------------------
     Derived profile data
  ----------------------------------------------------- */

  const displayName = user.fullName || user.username || "User";

  const displayUsername = String(user.username || "").replace(
    /^@+/,
    ""
  );

  const avatarSrc =
    avatarPreview || user.avatar || user.avatarUrl || "";

  const coverSrc = coverPreview || user.coverImage || "";

  const stats = user.stats || {};

  const websiteHref = getWebsiteUrl(user.website);

  const publishedVideos = videos.filter(
    (video) => video?.isPublished !== false
  );

  const firstMomentId = String(
    myMoments[0]?._id || myMoments[0]?.id || "none"
  );

  const followersCount = Number(
    stats.followers ?? user.followersCount ?? 0
  );

  const followingCount = Number(
    stats.following ?? user.followingCount ?? 0
  );

  /* -----------------------------------------------------
     Page UI
  ----------------------------------------------------- */

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900">
      {(success || error) && (
        <div
          role={error ? "alert" : "status"}
          aria-live="polite"
          className={`fixed right-4 top-20 z-[300] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ? (
            <X className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}

          <span>{error || success}</span>
        </div>
      )}

      <div className="mx-auto w-full max-w-7xl px-3 pb-12 sm:px-6 lg:px-8">
        {/* Cover and avatar */}
        <section className="relative pt-2">
          {isOwnProfile && (
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingCover}
                onChange={(event) =>
                  handleImageUpload(event, "cover")
                }
              />

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={(event) =>
                  handleImageUpload(event, "avatar")
                }
              />
            </>
          )}

          <ProfileCover
            image={coverSrc}
            editable={isOwnProfile}
            loading={uploadingCover}
            onEdit={() => coverInputRef.current?.click()}
          />

          <div className="relative -mt-12 flex flex-col gap-4 px-3 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <ProfileAvatar
              image={avatarSrc}
              name={displayName}
              editable={isOwnProfile}
              loading={uploadingAvatar}
              hasMoments={isOwnProfile && myMoments.length > 0}
              onEdit={() => avatarInputRef.current?.click()}
              onAvatarClick={openOwnMoments}
              avatarButtonDisabled={
                !isOwnProfile ||
                momentsLoading ||
                myMoments.length === 0
              }
            />

            <div className="flex flex-wrap gap-2 sm:pb-1">
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={openEditProfile}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isFollowing
                      ? "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                      : "bg-violet-600 text-white hover:bg-violet-700"
                  }`}
                >
                  {followLoading && (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  )}

                  {isFollowing ? "Following" : "Follow"}
                </button>
              )}

              <button
                type="button"
                title="Refresh profile"
                aria-label="Refresh profile"
                onClick={() => {
                  loadProfile();

                  if (isOwnProfile) {
                    loadVideos();
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Profile information */}
        <section className="mt-6 px-3 sm:px-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
            {displayName}
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            @{displayUsername}
          </p>

          {user.bio?.trim() && (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {user.bio}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500 sm:text-sm">
            {user.location?.trim() && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {user.location}
              </span>
            )}

            {user.website?.trim() && (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-violet-700 hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                {user.website}
              </a>
            )}

            {user.createdAt && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatJoinedDate(user.createdAt)}
              </span>
            )}
          </div>

          {/* Profile statistics */}
          <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3 border-b border-gray-200 pb-6">
            <div>
              <span className="font-bold text-gray-900">
                {stats.videos ?? publishedVideos.length}
              </span>

              <span className="ml-1.5 text-sm text-gray-500">
                Videos
              </span>
            </div>

            <button
              type="button"
              onClick={() => openPeopleList("followers")}
              aria-label={`View ${followersCount} followers`}
              className="group rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <span className="font-bold text-gray-900 group-hover:text-violet-700">
                {followersCount}
              </span>

              <span className="ml-1.5 text-sm text-gray-500 group-hover:text-violet-700">
                Followers
              </span>
            </button>

            <button
              type="button"
              onClick={() => openPeopleList("following")}
              aria-label={`View ${followingCount} following`}
              className="group rounded-md text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <span className="font-bold text-gray-900 group-hover:text-violet-700">
                {followingCount}
              </span>

              <span className="ml-1.5 text-sm text-gray-500 group-hover:text-violet-700">
                Following
              </span>
            </button>
          </div>
        </section>

        {/* Profile tabs */}
        <section className="mt-5">
          <div className="flex items-center justify-between border-b border-gray-200 px-3 sm:px-6">
            <button
              type="button"
              onClick={() => setActiveTab("videos")}
              className={`relative shrink-0 pb-3 text-sm font-semibold ${
                activeTab === "videos"
                  ? "text-gray-950"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Video className="h-4 w-4" />
                Videos
              </span>

              {activeTab === "videos" && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet-600" />
              )}
            </button>

            {/* About menu */}
            <div className="relative ml-auto pb-2">
              <button
                type="button"
                aria-label="More profile options"
                aria-haspopup="menu"
                aria-expanded={aboutMenuOpen}
                onClick={() =>
                  setAboutMenuOpen((open) => !open)
                }
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>

              {aboutMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close profile menu"
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setAboutMenuOpen(false)}
                  />

                  <div
                    role="menu"
                    className="absolute right-0 top-full z-40 mt-1 min-w-40 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveTab("about");
                        setAboutMenuOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 transition hover:bg-violet-50 hover:text-violet-700"
                    >
                      About
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Videos tab */}
          {activeTab === "videos" && (
            <div className="px-3 py-6 sm:px-6">
              {videosLoading ? (
                <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div
                      key={index}
                      className="animate-pulse"
                    >
                      <div className="aspect-video rounded-xl bg-gray-200" />
                      <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              ) : publishedVideos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-14 text-center">
                  <Video className="mx-auto h-10 w-10 text-gray-400" />

                  <h2 className="mt-4 font-semibold text-gray-900">
                    No videos yet
                  </h2>

                  <p className="mt-2 text-sm text-gray-500">
                    Published videos will appear here.
                  </p>

                  {isOwnProfile && (
                    <button
                      type="button"
                      onClick={() => navigate("/upload")}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                    >
                      <Plus size={16} />
                      Upload video
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-x-4 gap-y-7 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {publishedVideos.map((video, index) => {
                    const videoId = video._id || video.id;

                    return (
                      <ProfileVideoCard
                        key={videoId || index}
                        video={video}
                        onOpen={() => {
                          if (videoId) {
                            navigate(`/video/${videoId}`);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* About tab */}
          {activeTab === "about" && (
            <section className="px-3 py-6 sm:px-6">
              <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
                <h2 className="text-lg font-semibold tracking-tight text-gray-950">
                  About {displayName}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Account information
                </p>

                <div className="mt-6">
                  {user.location?.trim() && (
                    <div className="flex items-center gap-4 border-b border-gray-100 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                        <MapPin size={18} className="text-violet-700" />
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Location
                        </p>

                        <p className="mt-1 text-sm font-medium text-gray-900">
                          {user.location}
                        </p>
                      </div>
                    </div>
                  )}

                  {user.website?.trim() && (
                    <div className="flex items-center gap-4 border-b border-gray-100 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                        <ExternalLink size={18} className="text-violet-700" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">
                          Website
                        </p>

                        <a
                          href={websiteHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block break-all text-sm font-medium text-violet-700 hover:underline"
                        >
                          {user.website}
                        </a>
                      </div>
                    </div>
                  )}

                  {user.createdAt && (
                    <div className="flex items-center gap-4 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                        <CalendarDays size={18} className="text-violet-700" />
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Joined
                        </p>

                        <p className="mt-1 text-sm font-medium text-gray-900">
                          {new Date(user.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "long",
                              year: "numeric",
                            }
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {user.bio?.trim() && (
                    <div className="border-t border-gray-100 py-4">
                      <p className="text-xs text-gray-500">Bio</p>

                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                        {user.bio}
                      </p>
                    </div>
                  )}

                  {!user.location?.trim() &&
                    !user.website?.trim() &&
                    !user.createdAt &&
                    !user.bio?.trim() && (
                      <p className="py-6 text-sm text-gray-500">
                        No additional account information available.
                      </p>
                    )}
                </div>
              </div>
            </section>
          )}
        </section>
      </div>

      {/* Followers / following modal */}
      {peopleModal.open && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePeopleModal();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="people-modal-title"
            className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                  {peopleModal.type === "followers" ? (
                    <Users size={19} />
                  ) : (
                    <UserPlus size={19} />
                  )}
                </div>

                <div>
                  <h2
                    id="people-modal-title"
                    className="text-base font-bold text-gray-900"
                  >
                    {peopleModal.type === "followers"
                      ? "Followers"
                      : "Following"}
                  </h2>

                  <p className="text-xs text-gray-500">
                    {peopleLoading
                      ? "Loading people..."
                      : `${filteredPeople.length} ${
                          filteredPeople.length === 1
                            ? "person"
                            : "people"
                        }`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closePeopleModal}
                aria-label="Close people list"
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              >
                <X size={20} />
              </button>
            </header>

            <div className="border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3">
                <Search size={17} className="shrink-0 text-gray-400" />

                <input
                  type="text"
                  value={peopleSearch}
                  onChange={(event) =>
                    setPeopleSearch(event.target.value)
                  }
                  placeholder="Search people..."
                  aria-label="Search people"
                  className="w-full bg-transparent py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400"
                />

                {peopleSearch && (
                  <button
                    type="button"
                    onClick={() => setPeopleSearch("")}
                    aria-label="Clear search"
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {peopleLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-gray-500">
                  <LoaderCircle className="h-7 w-7 animate-spin text-violet-600" />

                  <p className="text-sm">
                    Loading{" "}
                    {peopleModal.type === "followers"
                      ? "followers"
                      : "following"}
                    ...
                  </p>
                </div>
              ) : peopleError ? (
                <div className="px-5 py-10 text-center">
                  <Users className="mx-auto h-9 w-9 text-gray-300" />

                  <p className="mt-3 text-sm font-medium text-gray-800">
                    Unable to show this list
                  </p>

                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    {peopleError}
                  </p>

                  <button
                    type="button"
                    onClick={() => openPeopleList(peopleModal.type)}
                    className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                  >
                    Try again
                  </button>
                </div>
              ) : filteredPeople.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Users className="mx-auto h-9 w-9 text-gray-300" />

                  <p className="mt-3 text-sm font-semibold text-gray-800">
                    {peopleSearch
                      ? "No matching people"
                      : peopleModal.type === "followers"
                        ? "No followers yet"
                        : "Not following anyone yet"}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {peopleSearch
                      ? "Try a different name or username."
                      : "People will appear here when available."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredPeople.map((person, index) => {
                    const personId = getId(person);

                    return (
                      <PersonListItem
                        key={
                          personId ||
                          `${getPersonName(person)}-${index}`
                        }
                        person={person}
                        onClick={() => {
                          if (!personId) return;

                          closePeopleModal();

                          if (personId === getId(user)) {
                            if (!isOwnProfile) {
                              navigate("/profile");
                            }

                            return;
                          }

                          navigate(`/profile/${personId}`);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={closePeopleModal}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* Edit profile dialog */}
      {isEditOpen && isOwnProfile && (
        <div
          className="fixed inset-0 z-[200] h-[100dvh] w-screen overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditProfile();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="mx-auto flex min-h-full w-full max-w-2xl flex-col bg-white text-gray-900 shadow-2xl sm:min-h-0 sm:rounded-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-7">
              <div>
                <h2
                  id="edit-profile-title"
                  className="text-xl font-semibold"
                >
                  Edit Profile
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Update your profile information
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditProfile}
                disabled={saving}
                aria-label="Close edit profile"
                className="rounded-xl border border-gray-200 p-2.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <form
              onSubmit={handleSaveProfile}
              className="flex flex-1 flex-col"
            >
              <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-5 py-6 sm:px-7">
                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label
                    htmlFor="profile-fullName"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Full name
                  </label>

                  <input
                    id="profile-fullName"
                    name="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleFormChange}
                    maxLength={100}
                    required
                    placeholder="Enter your full name"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="profile-username"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Username
                  </label>

                  <input
                    id="profile-username"
                    name="username"
                    type="text"
                    value={formData.username}
                    onChange={handleFormChange}
                    autoCapitalize="none"
                    autoCorrect="off"
                    maxLength={50}
                    required
                    placeholder="your_username"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />

                  <p className="text-xs text-gray-500">
                    Do not add a leading @.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="profile-bio"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Bio
                    </label>

                    <span className="text-xs text-gray-500">
                      {formData.bio.length}/150
                    </span>
                  </div>

                  <textarea
                    id="profile-bio"
                    name="bio"
                    value={formData.bio}
                    onChange={handleFormChange}
                    maxLength={150}
                    rows={4}
                    placeholder="Tell people something about yourself..."
                    className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
              </div>

              <footer className="mt-auto border-t border-gray-200 bg-white px-5 py-4 sm:px-7">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeEditProfile}
                    disabled={saving}
                    className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* Crop editor */}
      {cropEditor && isOwnProfile && (
        <div
          id="profile-crop-editor"
          className="fixed inset-0 z-[250] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-editor-title"
            className="my-auto w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="crop-editor-title"
                  className="text-lg font-bold tracking-tight text-gray-900"
                >
                  Adjust{" "}
                  {cropEditor.type === "avatar"
                    ? "profile photo"
                    : "cover image"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Zoom and drag the image to get the perfect fit.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCropEditor}
                disabled={uploadingAvatar || uploadingCover}
                aria-label="Close image editor"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-900 transition hover:bg-gray-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            {/* Image preview */}
            <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-slate-100 p-4 sm:min-h-[340px] sm:p-6">
              <div
                ref={cropFrameRef}
                className={`relative mx-auto shrink-0 overflow-hidden bg-gray-100 shadow-lg ${
                  cropEditor.type === "avatar"
                    ? "h-64 w-64 rounded-full"
                    : "aspect-[3/1] w-full rounded-2xl"
                } ${cropDragging ? "cursor-grabbing" : "cursor-grab"}`}
                style={{ touchAction: "none" }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);

                  cropDragStart.current = {
                    pointerX: event.clientX,
                    pointerY: event.clientY,
                    x: cropOffset.x,
                    y: cropOffset.y,
                  };

                  setCropDragging(true);
                }}
                onPointerMove={(event) => {
                  if (!cropDragStart.current) return;

                  setCropOffset({
                    x:
                      cropDragStart.current.x +
                      event.clientX -
                      cropDragStart.current.pointerX,
                    y:
                      cropDragStart.current.y +
                      event.clientY -
                      cropDragStart.current.pointerY,
                  });
                }}
                onPointerUp={() => {
                  cropDragStart.current = null;
                  setCropDragging(false);
                }}
                onPointerCancel={() => {
                  cropDragStart.current = null;
                  setCropDragging(false);
                }}
              >
                <img
                  src={cropEditor.previewUrl}
                  alt="Crop preview"
                  draggable="false"
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
                  style={{
                    transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                    transformOrigin: "center",
                  }}
                />

                {cropEditor.type === "avatar" && (
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/60" />
                )}
              </div>
            </div>

            {/* Zoom controls */}
            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="crop-zoom"
                  className="text-sm font-semibold text-gray-900"
                >
                  Zoom level
                </label>

                <span className="rounded-full border border-violet-100 bg-white px-3 py-1 text-xs font-bold text-violet-700">
                  {Math.round(cropZoom * 100)}%
                </span>
              </div>

              <input
                id="crop-zoom"
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={cropZoom}
                onChange={(event) =>
                  setCropZoom(Number(event.target.value))
                }
                className="mt-4 h-2 w-full cursor-pointer accent-violet-600"
              />

              <p className="mt-2 text-xs text-gray-500">
                Drag the image inside the frame to adjust its position.
              </p>
            </div>

            {/* Crop buttons */}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCropEditor}
                disabled={uploadingAvatar || uploadingCover}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveCroppedImage}
                disabled={uploadingAvatar || uploadingCover}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-[#eee5ff] px-6 py-3 text-sm font-bold text-gray-900 shadow-sm transition hover:bg-[#e4d5ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {(uploadingAvatar || uploadingCover) && (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                )}

                {uploadingAvatar || uploadingCover
                  ? "Saving..."
                  : "Crop & Save"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Own Moments viewer */}
      {activeMomentViewer && (
        <MomentViewer
          key={`${viewerId}-${firstMomentId}`}
          moments={activeMomentViewer.moments}
          owner={activeMomentViewer.owner}
          initialIndex={activeMomentViewer.initialIndex}
          onClose={() => setActiveMomentViewer(null)}
          onViewed={markAsViewed}
        />
      )}
    </div>
  );
}