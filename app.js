const os = require("os");
const fs = require("fs");
const path = require("path");
const express = require("express");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const cors = require("cors");
const app = express();
const PORT = 3000;
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

// Middleware para parsear el body de las solicitudes POST
app.use(express.json());
// app.use(cors({ origin: 'http://localhost:5173' }));
app.use(cors());

app.get("/download", (req, res) => {
  const url = req.query.url;
  const format = req.query.format;
  const quality = req.query.quality;

  ytdl(url, {
    format: format,
    quality: quality,
  }).pipe(res);
});

// app.get("/download", async (req, res) => {
//   const url = req.query.url;
//   const videoQuality = req.query.quality;

//   try {
//     // Almacena la información del video en una variable
//     let info = await ytdl.getInfo(url);

//     // Selecciona un formato de video que coincida con la calidad de video solicitada
//     const videoFormat = ytdl.chooseFormat(info.formats, {
//       quality: videoQuality,
//     });

//     // Filtra los formatos para obtener solo audio
//     const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
//     // Selecciona el formato de audio de más alta calidad disponible
//     const audioFormat = audioFormats.sort(
//       (a, b) => b.audioBitrate - a.audioBitrate
//     )[0];

//     if (videoFormat && audioFormat) {
//       const videoStream = ytdl.downloadFromInfo(info, { format: videoFormat });
//       const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });

//       // res.setHeader("Content-Disposition", `attachment; filename=video.mp4`);
//       // Descarga el video y el audio por separado
//       const videoPromise = new Promise((resolve, reject) => {
//         videoStream
//           .pipe(fs.createWriteStream("video.mp4"))
//           .on("finish", resolve)
//           .on("error", reject);
//       });
//       const audioPromise = new Promise((resolve, reject) => {
//         audioStream
//           .pipe(fs.createWriteStream("audio.mp3"))
//           .on("finish", resolve)
//           .on("error", reject);
//       });

//       // Espera a que ambas descargas terminen
//       await Promise.all([videoPromise, audioPromise]);

//       const videoPath = "video.mp4";
//       const audioPath = "audio.mp3";
//       const outputPath = "combined.mp4";

//       ffmpeg(videoPath)
//         .input(audioPath)
//         .output(outputPath)
//         .on("end", () => {
//           console.log("Video y audio combinados exitosamente!");
//           res.download(outputPath);
//         })
//         .run();
//     } else {
//       res
//         .status(400)
//         .send(
//           "No se encontró un formato que coincida con la calidad de video solicitada y la más alta calidad de audio disponible."
//         );
//     }
//   } catch (err) {
//     console.error(err);
//     res.status(500).send(err.message);
//   }
// });

app.get("/download-audio", (req, res) => {
  const url = req.query.url;

  ytdl
    .getInfo(url)
    .then((info) => {
      const format = ytdl.chooseFormat(info.formats, {
        quality: "highestaudio",
      });
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=video.${format.container}`
      );
      ytdl.downloadFromInfo(info, { format: format }).pipe(res);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send(err.message);
    });
});

// Endpoint para obtener la lista de calidades disponibles
app.post("/video-info", async (req, res) => {
  const url = req.body.url;
  try {
    if (!url || !ytdl.validateURL(url)) {
      throw new Error("URL de video no válida");
    }
    const info = await ytdl.getInfo(url);
    const formats = info.formats
      .filter(
        (format) =>
          format.audioCodec && format.url
      )
      .map((format) => ({
        quality: format.audioQuality,
        format: format.container,
        itag: format.itag,
      }))
      .sort((a, b) => {
        // Obtener el ranking de la calidad
        const rankA = getQualityRank(a.quality);
        const rankB = getQualityRank(b.quality);

        // Ordenar por calidad de más alta a más baja
        if (rankA !== rankB) {
          return rankB - rankA;
        } else {
          // Si las calidades son iguales, ordenar por la presencia de 60 FPS
          const fpsA = hasFPS(a.quality);
          const fpsB = hasFPS(b.quality);
          return fpsB - fpsA;
        }
      });
    res.json(formats);
  } catch (error) {
    console.error("Error al obtener la lista de calidades:", error);
    res.status(400).json({ error: error.message });
  }
});


// app.post("/video-info", async (req, res) => {
//   const url = req.body.url;
//   try {
//     if (!url || !ytdl.validateURL(url)) {
//       throw new Error("URL de video no válida");
//     }
//     const info = await ytdl.getInfo(url);
//     const formats = info.formats
//       .filter(
//         (format) =>
//           format.container === "mp4" && format.qualityLabel && format.url
//       )
//       .map((format) => ({
//         quality: format.qualityLabel,
//         format: format.container,
//         itag: format.itag,
//       }))
//       .sort((a, b) => {
//         // Obtener el ranking de la calidad
//         const rankA = getQualityRank(a.quality);
//         const rankB = getQualityRank(b.quality);

//         // Ordenar por calidad de más alta a más baja
//         if (rankA !== rankB) {
//           return rankB - rankA;
//         } else {
//           // Si las calidades son iguales, ordenar por la presencia de 60 FPS
//           const fpsA = hasFPS(a.quality);
//           const fpsB = hasFPS(b.quality);
//           return fpsB - fpsA;
//         }
//       });
//     res.json(formats);
//   } catch (error) {
//     console.error("Error al obtener la lista de calidades:", error);
//     res.status(400).json({ error: error.message });
//   }
// });

// Función para asignar un ranking a las calidades
function getQualityRank(quality) {
  const qualityRanking = {
    "2160p60": 10,
    "2160p": 9,
    "1440p60": 8,
    "1440p": 7,
    "1080p60": 6,
    "1080p": 5,
    "720p60": 4,
    "720p": 3,
    "480p": 2,
    "360p": 1,
    "240p": 0,
    "144p": -1,
  };
  return qualityRanking[quality] || 0; // Si la calidad no está en el ranking, asigna 0
}

// Función para verificar si la calidad tiene 60 FPS
function hasFPS(quality) {
  return quality.includes("60");
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
