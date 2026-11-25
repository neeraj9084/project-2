import api from "../../lib/axios";

function unwrapResponse(response) {
  return response?.data?.data ?? response?.data ?? response;
}

// Create a Moment using multipart/form-data.
export async function createMoment({
  media,
  caption = "",
  music = null,
}) {
  if (!(media instanceof File)) {
    throw new Error("Please select an image or video.");
  }

  const formData = new FormData();

  // Backend multer.single("media") expects this exact field.
  formData.append("media", media);
  formData.append("caption", caption.trim());

  if (music && typeof music === "object") {
    const hasMusic = Object.values(music).some(
      (value) => String(value || "").trim()
    );

    if (hasMusic) {
      formData.append("music", JSON.stringify(music));
    }
  }

  const response = await api.post("/moments", formData);

  return unwrapResponse(response);
}

// Home feed: own + followed users' active Moments.
export async function getMoments(params = {}) {
  const response = await api.get("/moments", { params });
  return unwrapResponse(response);
}

// Current user's own Moments.
export async function getMyMoments() {
  const response = await api.get("/moments/my");
  return unwrapResponse(response);
}

// Moments belonging to a specific profile user.
export async function getUserMoments(userId) {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  const response = await api.get(
    `/moments/user/${encodeURIComponent(userId)}`
  );

  return unwrapResponse(response);
}

// Fetch the latest details for one active Moment.
export async function getMomentById(momentId) {
  if (!momentId) {
    throw new Error("Moment ID is required.");
  }

  const response = await api.get(
    `/moments/${encodeURIComponent(momentId)}`
  );

  return unwrapResponse(response);
}

// Record a view.
export async function viewMoment(momentId) {
  if (!momentId) {
    throw new Error("Moment ID is required.");
  }

  const response = await api.post(
    `/moments/${encodeURIComponent(momentId)}/view`
  );

  return unwrapResponse(response);
}

// Retrieve viewers of a Moment owned by the logged-in user.
export async function getMomentViewers(momentId, params = {}) {
  if (!momentId) {
    throw new Error("Moment ID is required.");
  }

  const response = await api.get(
    `/moments/${encodeURIComponent(momentId)}/viewers`,
    { params }
  );

  return unwrapResponse(response);
}

// Delete the logged-in user's Moment.
export async function deleteMoment(momentId) {
  if (!momentId) {
    throw new Error("Moment ID is required.");
  }

  const response = await api.delete(
    `/moments/${encodeURIComponent(momentId)}`
  );

  return unwrapResponse(response);
}