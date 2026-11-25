import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const searchMusic = asyncHandler(async (req, res) => {
    const query =
        typeof req.query.q === "string"
            ? req.query.q.trim()
            : "";

    if (query.length < 2 || query.length > 100) {
        throw new ApiError(
            400,
            "Search query must contain 2 to 100 characters"
        );
    }

    const clientId = process.env.JAMENDO_CLIENT_ID;

    if (!clientId) {
        throw new ApiError(500, "Jamendo Client ID is not configured");
    }

    const url = new URL(
        "https://api.jamendo.com/v3.0/tracks/"
    );

    url.searchParams.set("client_id", clientId);
    url.searchParams.set("format", "json");
    url.searchParams.set("search", query);
    url.searchParams.set("limit", "15");
    url.searchParams.set("audioformat", "mp32");
    url.searchParams.set("include", "musicinfo");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new ApiError(502, "Jamendo music provider failed");
        }

        const result = await response.json();

        if (result.headers?.status !== "success") {
            throw new ApiError(502, "Jamendo search failed");
        }

        const tracks = Array.isArray(result.results)
            ? result.results
            : [];

        const music = tracks.map((track) => ({
            provider: "jamendo",
            trackId: String(track.id || ""),
            title: track.name || "",
            artist: track.artist_name || "",
            image: track.album_image || "",
            previewUrl: track.audio || "",
            officialUrl: track.shareurl || "",
            durationSeconds: Number(track.duration) || 0,
            licenseUrl: track.license_ccurl || "",
        }));

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    query,
                    count: music.length,
                    results: music,
                },
                "Music search completed successfully"
            )
        );
    } catch (error) {
        if (error.name === "AbortError") {
            throw new ApiError(504, "Music search timed out");
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
});