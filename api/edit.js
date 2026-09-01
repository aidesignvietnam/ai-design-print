import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      image,
      editPrompt,
    } = req.body;

    if (!image) {
      return res.status(400).json({
        error: "Không có ảnh để chỉnh sửa.",
      });
    }

    if (!editPrompt || !editPrompt.trim()) {
      return res.status(400).json({
        error: "Vui lòng nhập yêu cầu chỉnh sửa.",
      });
    }

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: image,
      prompt: editPrompt,
    });

    const imageBase64 = response.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("OpenAI không trả về ảnh.");
    }

    return res.status(200).json({
      image: `data:image/png;base64,${imageBase64}`,
    });
  } catch (error) {
    console.error("EDIT ERROR:", error);

    return res.status(500).json({
      error: error.message || "Không thể chỉnh sửa thiết kế.",
    });
  }
}
