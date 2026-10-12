import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const searchMusic = asyncHandler(async (req, res) => {
    const query =
        typeof req.query.q === "string"
            ? req.query.q.trim()
            : "";

    if (!query) {
        throw new ApiError(
            400,
            "Search query is required"
        );
    }

    if (query.length < 2) {
        throw new ApiError(
            400,
            "Search query must contain at least 2 characters"
        );
    }

    if (query.length > 100) {
        throw new ApiError(
            400,
            "Search query cannot exceed 100 characters"
        );
    }

    const url =
        `https://sayamusicapi.shnwazdeveloperx.workers.dev/v1/jiosaavn/search/songs?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 10000);

    try {
        const response = await fetch(
            url,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                },
                signal: controller.signal
            }
        );

        if (!response.ok) {
            throw new ApiError(
                502,
                "Music service request failed"
            );
        }

        const result = await response.json();

        const songs =
            Array.isArray(result?.data?.results)
                ? result.data.results
                : [];

        const music = songs.map((song) => ({
            provider: "jiosaavn",
            trackId: song.id || "",
            title: song.title || "",
            artist: song.artist || song.singers || "",
            image: song.image || "",
            previewUrl: song.previewUrl || "",
            officialUrl: song.officialUrl || "",
            durationSeconds:
                Number(song.durationSeconds) || 0,
            language: song.language || "",
            explicit: Boolean(song.explicit)
        }));

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    query,
                    total: Number(result?.data?.total) || music.length,
                    count: music.length,
                    results: music
                },
                "Music search completed successfully"
            )
        );
    } catch (error) {
        if (error.name === "AbortError") {
            throw new ApiError(
                504,
                "Music service timed out"
            );
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
});

export {
    searchMusic
};