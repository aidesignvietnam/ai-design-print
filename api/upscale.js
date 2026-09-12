import sharp from "sharp";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      image,
      scale = 2,
      mode = "standard",
    } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "Không có ảnh để kích nét.",
      });
    }

    let imageBuffer;

    if (image.startsWith("data:")) {
      const base64Data = image.split(",")[1];

      if (!base64Data) {
        throw new Error("Dữ liệu ảnh không hợp lệ.");
      }

      imageBuffer = Buffer.from(
        base64Data,
        "base64"
      );
    } else {
      imageBuffer = Buffer.from(
        image,
        "base64"
      );
    }

    const metadata =
      await sharp(imageBuffer).metadata();

    const originalWidth =
      metadata.width || 0;

    const originalHeight =
      metadata.height || 0;

    if (
      !originalWidth ||
      !originalHeight
    ) {
      return res.status(400).json({
        error:
          "Không xác định được kích thước ảnh.",
      });
    }

    let multiplier =
      Number(scale) || 2;

    if (
      ![2, 4, 8].includes(multiplier)
    ) {
      multiplier = 2;
    }

    /*
     * Giới hạn kích thước để tránh
     * server bị quá tải.
     */
    const MAX_PIXELS =
      mode === "print"
        ? 100000000
        : 50000000;

    let targetWidth =
      originalWidth * multiplier;

    let targetHeight =
      originalHeight * multiplier;

    const totalPixels =
      targetWidth * targetHeight;

    if (totalPixels > MAX_PIXELS) {
      const safeScale = Math.sqrt(
        MAX_PIXELS / totalPixels
      );

      targetWidth = Math.max(
        1,
        Math.round(
          targetWidth * safeScale
        )
      );

      targetHeight = Math.max(
        1,
        Math.round(
          targetHeight * safeScale
        )
      );
    }

    /*
     * Lanczos giữ chi tiết tốt khi
     * phóng ảnh.
     */
    let processor = sharp(imageBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      });

    /*
     * PRINT HD:
     * tăng nhẹ độ tương phản và độ nét.
     * Không làm quá mạnh để tránh viền giả.
     */
    if (mode === "print") {
      processor = processor
        .modulate({
          saturation: 1.02,
        })
        .sharpen({
          sigma: 1.15,
          m1: 0.7,
          m2: 2.0,
        });
    } else {
      processor = processor.sharpen({
        sigma: 0.8,
        m1: 0.6,
        m2: 1.5,
      });
    }

    const outputBuffer =
      await processor
        .png({
          compressionLevel: 6,
        })
        .toBuffer();

    return res.status(200).json({
      image:
        `data:image/png;base64,${outputBuffer.toString(
          "base64"
        )}`,

      originalWidth,
      originalHeight,

      outputWidth: targetWidth,
      outputHeight: targetHeight,

      scale: multiplier,
      mode,
    });
  } catch (error) {
    console.error(
      "UPSCALE ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể kích nét ảnh.",
    });
  }
}
