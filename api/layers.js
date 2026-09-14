import { fal } from "@fal-ai/client";

function extractDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new Error("Ảnh không hợp lệ.");
  }

  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    throw new Error("Ảnh phải là Data URL hợp lệ.");
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "Thiếu ảnh cần tách nền.",
      });
    }

    if (!process.env.FAL_KEY) {
      return res.status(500).json({
        error: "Chưa cấu hình FAL_KEY trên Vercel.",
      });
    }

    // Kiểm tra Data URL trước khi gửi sang Fal AI
    extractDataUrl(image);

    fal.config({
      credentials: process.env.FAL_KEY,
    });

    console.log("LAYERS: bắt đầu tách nền bằng Fal AI...");

    const result = await fal.subscribe("fal-ai/imageutils/rembg", {
      input: {
        image_url: image,
      },
      logs: true,
    });

    console.log("LAYERS: Fal AI trả kết quả.");

    const outputImage =
      result?.data?.image?.url ||
      result?.image?.url ||
      null;

    if (!outputImage) {
      console.error("FAL RESULT:", result);

      throw new Error(
        "Fal AI không trả về ảnh PNG trong suốt."
      );
    }

    return res.status(200).json({
      success: true,

      layers: [
        {
          id: "background-1",
          type: "background",
          name: "Background",
          description: "Nền gốc của thiết kế.",
          order: 0,
          editable: true,
          source: "original-image",
          image: image,
          svg: null,
        },

        {
          id: "foreground-1",
          type: "foreground",
          name: "Foreground",
          description:
            "Đối tượng chính được Fal AI tách khỏi nền bằng nền trong suốt.",
          order: 1,
          editable: true,
          source: "fal-ai-rembg",
          image: outputImage,
          svg: null,
        },
      ],

      transparentImage: outputImage,

      message:
        "Fal AI đã tách đối tượng khỏi nền thành công.",
    });
  } catch (error) {
    console.error("LAYERS ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tách nền bằng Fal AI.",
    });
  }
}