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
      const commaIndex = image.indexOf(",");

      if (commaIndex === -1) {
        throw new Error(
          "Dữ liệu ảnh không hợp lệ."
        );
      }

      const base64Data =
        image.slice(commaIndex + 1);

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

    if (!imageBuffer.length) {
      throw new Error(
        "Không thể đọc dữ liệu ảnh."
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
     * Giới hạn tổng số pixel để bảo vệ
     * server khi xử lý ảnh rất lớn.
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
     * Kích nét bằng Lanczos.
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
     * xử lý nhẹ để phù hợp với ảnh
     * dùng cho in ấn.
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

    /*
     * Xuất PNG.
     */
    const outputBuffer =
      await processor
        .png({
          compressionLevel: 6,
        })
        .toBuffer();

    /*
     * Trả file ảnh trực tiếp thay vì
     * nhét ảnh Base64 vào JSON.
     */
    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ai-kich-net.png"'
    );

    res.setHeader(
      "X-Original-Width",
      String(originalWidth)
    );

    res.setHeader(
      "X-Original-Height",
      String(originalHeight)
    );

    res.setHeader(
      "X-Output-Width",
      String(targetWidth)
    );

    res.setHeader(
      "X-Output-Height",
      String(targetHeight)
    );

    res.setHeader(
      "X-Scale",
      String(multiplier)
    );

    res.setHeader(
      "X-Mode",
      mode
    );

    return res.end(outputBuffer);
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
