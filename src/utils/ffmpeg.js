import { spawn } from "child_process";

const compressVideo = (inputPath, outputPath) => {

    return new Promise((resolve) => {

        const ffmpeg = spawn("ffmpeg", [
            "-i", inputPath,

            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "28",

            "-c:a", "aac",
            "-b:a", "128k",

            "-movflags", "+faststart",

            "-y",
            outputPath
        ]);

        let duration = 0;

        ffmpeg.stderr.on("data", (data) => {

            const output = data.toString();

            // Get total duration
            const durationMatch = output.match(
                /Duration:\s*(\d+):(\d+):([\d.]+)/
            );

            if (durationMatch) {
                const hours = parseInt(durationMatch[1]);
                const minutes = parseInt(durationMatch[2]);
                const seconds = parseFloat(durationMatch[3]);

                duration =
                    hours * 3600 +
                    minutes * 60 +
                    seconds;
            }

            // Get current processed time
            const timeMatch = output.match(
                /time=(\d+):(\d+):([\d.]+)/
            );

            if (timeMatch && duration > 0) {

                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = parseFloat(timeMatch[3]);

                const currentTime =
                    hours * 3600 +
                    minutes * 60 +
                    seconds;

                const percentage =
                    Math.min(
                        (currentTime / duration) * 100,
                        100
                    );

                // Get speed
                const speedMatch = output.match(
                    /speed=\s*([\d.]+)x/
                );

                const speed = speedMatch
                    ? speedMatch[1]
                    : "N/A";

                process.stdout.write(
                    `\rCompression: ${percentage.toFixed(1)}% | Time: ${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s | Speed: ${speed}x`
                );
            }
        });

        ffmpeg.on("close", (code) => {

            console.log("");

            if (code === 0) {

                console.log("Video compressed successfully");

                resolve(outputPath);

            } else {

                console.log(
                    "FFmpeg exited with code:",
                    code
                );

                resolve(null);
            }
        });

        ffmpeg.on("error", (error) => {

            console.log(
                "FFmpeg process error:",
                error
            );

            resolve(null);
        });
    });
};

export { compressVideo };