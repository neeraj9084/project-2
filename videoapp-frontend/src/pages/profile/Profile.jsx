
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Camera,
  Image as ImageIcon,
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
} from "lucide-react";

import {
  getCurrentUser,
  updateAccountDetails,
  updateAvatar,
  updateCoverImage,
} from "../../services/user/userApi";

import { getMyVideos } from "../../services/video/videoApi";

const formatJoinedDate = (date) => {
  if (!date) return "";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "";

  return `Joined ${parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  })}`;
};

const getVideoArray = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.videos)) return response.videos;
  if (Array.isArray(response?.docs)) return response.docs;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.videos)) return response.data.videos;
  if (Array.isArray(response?.data?.docs)) return response.data.docs;

  return [];
};

export default function Profile() {
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("videos");

  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    bio: "",
  });

  const [avatarPreview, setAvatarPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      setError("");

      const currentUser = await getCurrentUser();

      if (!currentUser) {
        throw new Error("User information could not be loaded.");
      }

      setUser(currentUser);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load profile."
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
    loadVideos();
  }, [loadProfile, loadVideos]);

  // Automatically dismiss notifications.
  useEffect(() => {
    if (!success && !error) return;

    const timeoutId = setTimeout(() => {
      setSuccess("");
      setError("");
    }, success ? 1500 : 4000);

    return () => clearTimeout(timeoutId);
  }, [success, error]);

  // Lock background scrolling while the editor is open.
  useEffect(() => {
    if (!isEditOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) {
        setIsEditOpen(false);
        setError("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditOpen, saving]);

  // Revoke temporary image URLs when they change or the component unmounts.
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

  const openEditProfile = () => {
    if (!user) return;

    setFormData({
      fullName: user.fullName || "",
      username: (user.username || "").replace(/^@+/, ""),
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

    if (!formData.fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!formData.username.trim()) {
      setError("Please enter your username.");
      return;
    }

    if (formData.bio.trim().length > 150) {
      setError("Bio cannot exceed 150 characters.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const updatedUser = await updateAccountDetails({
        fullName: formData.fullName.trim(),
        username: formData.username.trim().replace(/^@+/, ""),
        bio: formData.bio.trim(),
      });

      setUser((previous) => ({
        ...previous,
        ...(updatedUser?.user || updatedUser),
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

  const handleImageUpload = async (event, type) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image.");
      return;
    }

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

    const previewUrl = URL.createObjectURL(file);

    try {
      setUploading(true);
      setError("");
      setSuccess("");

      setPreview((previous) => {
        if (previous.startsWith("blob:")) {
          URL.revokeObjectURL(previous);
        }

        return previewUrl;
      });

      const result = await uploadFunction(file);
      const updatedUser = result?.user || result;

      setUser((previous) => ({
        ...previous,
        ...updatedUser,
      }));

      setPreview("");
      URL.revokeObjectURL(previewUrl);

      setSuccess(
        isAvatar
          ? "Profile photo updated."
          : "Cover image updated."
      );
    } catch (err) {
      setPreview("");
      URL.revokeObjectURL(previewUrl);

      setError(
        err?.response?.data?.message ||
          "Unable to upload image. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#080a0d] text-white">
        <LoaderCircle className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center text-white">
        <UserRound className="mx-auto mb-4 h-12 w-12 text-gray-500" />

        <h2 className="text-xl font-semibold">
          Unable to load profile
        </h2>

        <p className="mt-2 text-sm text-gray-400">
          {error || "Please try again."}
        </p>

        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadProfile();
          }}
          className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 font-medium hover:bg-violet-500"
        >
          Try Again
        </button>
      </div>
    );
  }

  const displayName = user.fullName || user.username || "User";
  const displayUsername = (user.username || "").replace(/^@+/, "");
  const avatarSrc = avatarPreview || user.avatar || "";
  const coverSrc = coverPreview || user.coverImage || "";
  const stats = user.stats || {};

  const publishedVideos = videos.filter(
    (video) => video?.isPublished !== false
  );

  return (
    <div className="min-h-screen bg-[#080a0d] text-white">
      {/* Modern toast notifications */}
      {(success || error) && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 top-20 z-[200] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 ${
            error
              ? "border-red-400/20 bg-[#1b1114]/95 text-red-300"
              : "border-emerald-400/20 bg-[#111a18]/95 text-emerald-300"
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
        {/* Cover image */}
        <section className="relative">
          <div className="relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950 via-[#171126] to-[#111827] sm:h-56 md:h-72">
            {coverSrc && (
              <img
                src={coverSrc}
                alt="Profile cover"
                className="h-full w-full object-cover"
              />
            )}

            <label className="absolute right-3 top-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-medium backdrop-blur-md transition hover:bg-black/80 sm:right-4 sm:top-4 sm:text-sm">
              {uploadingCover ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}

              {uploadingCover ? "Uploading..." : "Edit cover"}

              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingCover}
                onChange={(event) =>
                  handleImageUpload(event, "cover")
                }
              />
            </label>
          </div>

          {/* Avatar and profile actions */}
          <div className="relative -mt-12 flex flex-col gap-4 px-3 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div className="relative h-24 w-24 shrink-0 sm:h-32 sm:w-32">
              <div className="h-full w-full overflow-hidden rounded-full border-4 border-[#080a0d] bg-[#1a1b23]">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-violet-300">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <label
                title="Change profile photo"
                className="absolute bottom-1 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-[#080a0d] bg-violet-600 transition hover:bg-violet-500"
              >
                {uploadingAvatar ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}

                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={(event) =>
                    handleImageUpload(event, "avatar")
                  }
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 sm:pb-1">
              <button
                type="button"
                onClick={openEditProfile}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium transition hover:bg-white/10"
              >
                <Pencil className="h-4 w-4" />
                Edit Profile
              </button>

              <button
                type="button"
                title="Refresh profile"
                onClick={() => {
                  setLoading(true);
                  loadProfile();
                  loadVideos();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] transition hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Profile information */}
        <section className="mt-6 px-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {displayName}
            </h1>

            <Check
              aria-label="User"
              title="User"
              className="h-5 w-5 shrink-0 text-white"
              strokeWidth={3}
            />
          </div>

          {/* No extra @ before username */}
          <p className="mt-1 text-sm text-gray-400">
            {displayUsername}
          </p>

          {user.bio?.trim() && (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-gray-300">
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
                href={
                  /^https?:\/\//i.test(user.website)
                    ? user.website
                    : `https://${user.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-violet-300 hover:text-violet-200"
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

          {/* Stats */}
          <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3 border-b border-white/10 pb-6">
            <div>
              <span className="font-bold">
                {stats.videos ?? publishedVideos.length}
              </span>
              <span className="ml-1.5 text-sm text-gray-400">
                Videos
              </span>
            </div>

            <div>
              <span className="font-bold">
                {stats.followers ?? user.followersCount ?? 0}
              </span>
              <span className="ml-1.5 text-sm text-gray-400">
                Followers
              </span>
            </div>

            <div>
              <span className="font-bold">
                {stats.following ?? user.followingCount ?? 0}
              </span>
              <span className="ml-1.5 text-sm text-gray-400">
                Following
              </span>
            </div>
          </div>
        </section>

        {/* Profile tabs */}
        <section className="mt-5">
          <div className="flex gap-6 border-b border-white/10 px-3 sm:px-6">
            <button
              type="button"
              onClick={() => setActiveTab("videos")}
              className={`relative pb-3 text-sm font-medium transition ${
                activeTab === "videos"
                  ? "text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Video className="h-4 w-4" />
                Videos
              </span>

              {activeTab === "videos" && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("about")}
              className={`relative pb-3 text-sm font-medium transition ${
                activeTab === "about"
                  ? "text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              About

              {activeTab === "about" && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet-500" />
              )}
            </button>
          </div>

          {/* Videos tab */}
          {activeTab === "videos" && (
            <div className="px-3 py-6 sm:px-6">
              {videosLoading ? (
                <div className="flex justify-center py-12">
                  <LoaderCircle className="h-7 w-7 animate-spin text-violet-400" />
                </div>
              ) : publishedVideos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-5 py-14 text-center">
                  <Video className="mx-auto h-10 w-10 text-gray-600" />

                  <h2 className="mt-4 font-semibold">
                    No videos yet
                  </h2>

                  <p className="mt-2 text-sm text-gray-500">
                    Your published videos will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-x-4 gap-y-7 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {publishedVideos.map((video, index) => (
                    <article
                      key={video._id || video.id || index}
                      className="min-w-0"
                    >
                      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#171820]">
                        {video.thumbnail ? (
                          <img
                            src={video.thumbnail}
                            alt={video.title || "Video thumbnail"}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Video className="h-9 w-9 text-gray-600" />
                          </div>
                        )}
                      </div>

                      <h3 className="mt-3 line-clamp-2 text-sm font-medium leading-5 text-gray-100">
                        {video.title || "Untitled video"}
                      </h3>

                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          {video.views ?? 0} views
                        </span>

                        {video.createdAt && (
                          <span>
                            {new Date(video.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* About tab: account information only */}
          {activeTab === "about" && (
            <section className="px-3 py-6 sm:px-6">
              <div className="max-w-2xl rounded-2xl border border-white/[0.08] bg-[#11171d] p-5 sm:p-7">
                <h2 className="text-lg font-semibold tracking-tight text-[#f5f7fb]">
                  About {displayName}
                </h2>

                <p className="mt-1 text-sm text-[#7b8491]">
                  Account information
                </p>

                <div className="mt-6">
                  {user.location?.trim() && (
                    <div className="flex items-center gap-4 border-b border-white/[0.07] py-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
                        <MapPin
                          size={18}
                          className="text-[#8b82ff]"
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs text-[#7b8491]">
                          Location
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-[#f5f7fb]">
                          {user.location}
                        </p>
                      </div>
                    </div>
                  )}

                  {user.website?.trim() && (
                    <div className="flex items-center gap-4 border-b border-white/[0.07] py-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
                        <ExternalLink
                          size={18}
                          className="text-[#8b82ff]"
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs text-[#7b8491]">
                          Website
                        </p>

                        <a
                          href={
                            /^https?:\/\//i.test(user.website)
                              ? user.website
                              : `https://${user.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block break-all text-sm font-medium text-[#a59eff] hover:underline"
                        >
                          {user.website}
                        </a>
                      </div>
                    </div>
                  )}

                  {user.createdAt && (
                    <div className="flex items-center gap-4 py-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
                        <CalendarDays
                          size={18}
                          className="text-[#8b82ff]"
                        />
                      </div>

                      <div>
                        <p className="text-xs text-[#7b8491]">
                          Joined
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#f5f7fb]">
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

                  {!user.location?.trim() &&
                    !user.website?.trim() &&
                    !user.createdAt && (
                      <p className="py-6 text-sm text-[#7b8491]">
                        No account information available.
                      </p>
                    )}
                </div>
              </div>
            </section>
          )}
        </section>
      </div>

      {/* FULL-SCREEN EDIT PROFILE */}
      {isEditOpen && (
        <div className="fixed inset-0 z-[100] h-[100dvh] w-screen overflow-y-auto overscroll-contain bg-[#080a0d]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="flex min-h-full w-full flex-col bg-[#111218]"
          >
            {/* Header */}
            <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#111218]/95 px-5 py-4 backdrop-blur-xl sm:px-8">
              <div>
                <h2
                  id="edit-profile-title"
                  className="text-xl font-semibold"
                >
                  Edit Profile
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Update your profile information
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditProfile}
                disabled={saving}
                aria-label="Close edit profile"
                className="rounded-xl border border-white/10 p-2.5 text-gray-300 hover:bg-white/10 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Cover preview */}
            <div className="relative h-36 shrink-0 bg-gradient-to-r from-violet-950 via-[#201532] to-[#111827] sm:h-48 md:h-56">
              {coverSrc && (
                <img
                  src={coverSrc}
                  alt="Cover preview"
                  className="h-full w-full object-cover"
                />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-[#111218]/80 to-transparent" />

              <div className="absolute bottom-4 left-5 flex items-center gap-4 sm:left-8">
                <div className="h-16 w-16 overflow-hidden rounded-full border-4 border-[#111218] bg-[#252630] sm:h-20 sm:w-20">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt="Avatar preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xl font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-semibold">
                    {formData.fullName || displayName}
                  </p>
                  <p className="text-sm text-gray-300">
                    {formData.username.replace(/^@+/, "")}
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSaveProfile}
              className="flex flex-1 flex-col"
            >
              <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-5 py-7 sm:px-8 sm:py-9">
                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                  >
                    {error}
                  </div>
                )}

                {/* Full Name */}
                <div className="space-y-2">
                  <label
                    htmlFor="fullName"
                    className="block text-sm font-medium text-gray-300"
                  >
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleFormChange}
                    maxLength={100}
                    required
                    placeholder="Enter your full name"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
                  />
                </div>

                {/* Username */}
                <div className="space-y-2">
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium text-gray-300"
                  >
                    Username
                  </label>

                  <div className="flex items-center rounded-xl border border-white/10 bg-black/30 focus-within:border-violet-500">
                    <span className="pl-4 text-sm text-gray-500">
                      @
                    </span>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      value={formData.username}
                      onChange={handleFormChange}
                      maxLength={50}
                      required
                      placeholder="your_username"
                      className="min-w-0 flex-1 bg-transparent px-2 py-3.5 text-sm text-white outline-none placeholder:text-gray-600"
                    />
                  </div>

                  <p className="text-xs text-gray-500">
                    Use letters, numbers, underscores, @ or periods.
                  </p>
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="bio"
                      className="block text-sm font-medium text-gray-300"
                    >
                      Bio
                    </label>
                    <span className="text-xs text-gray-500">
                      {formData.bio.length}/150
                    </span>
                  </div>

                  <textarea
                    id="bio"
                    name="bio"
                    value={formData.bio}
                    onChange={handleFormChange}
                    maxLength={150}
                    rows={5}
                    placeholder="Tell people something about yourself..."
                    className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-sm leading-6 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
                  />

                  <p className="text-xs text-gray-500">
                    Share a little about yourself with your audience.
                  </p>
                </div>
              </div>

              {/* Sticky footer */}
              <footer className="sticky bottom-0 z-20 mt-auto border-t border-white/10 bg-[#111218]/95 px-5 py-4 backdrop-blur-xl sm:px-8">
                <div className="mx-auto flex w-full max-w-3xl flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeEditProfile}
                    disabled={saving}
                    className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-gray-300 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
} 
 