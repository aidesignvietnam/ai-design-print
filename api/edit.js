import OpenAI, { toFile } from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================================================
// DATA URL → BUFFER
// =====================================================

function dataUrlToBuffer(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:image/")
  ) {
    throw new Error(
      "Ảnh thiết kế đầu vào không hợp lệ."
    );
  }

  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    throw new Error(
      "Không đọc được dữ liệu ảnh thiết kế."
    );
  }

  return Buffer.from(
    match[2],
    "base64"
  );
}

// =====================================================
// TÍNH TỶ LỆ
// =====================================================

function getRatio(width, height) {
  const w = Number(width);
  const h = Number(height);

  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    return 1;
  }

  return w / h;
}

// =====================================================
// KÍCH THƯỚC XỬ LÝ
// =====================================================

function getTargetSize(width, height) {
  const ratio =
    getRatio(width, height);

  let targetWidth;
  let targetHeight;

  if (ratio >= 1) {
    targetWidth = 1536;
    targetHeight =
      Math.round(
        targetWidth / ratio
      );
  } else {
    targetHeight = 1536;
    targetWidth =
      Math.round(
        targetHeight * ratio
      );
  }

  /*
   * GPT Image yêu cầu kích thước
   * phù hợp với hệ thống ảnh.
   */
  targetWidth =
    Math.max(
      256,
      Math.round(
        targetWidth / 16
      ) * 16
    );

  targetHeight =
    Math.max(
      256,
      Math.round(
        targetHeight / 16
      ) * 16
    );

  return {
    width: targetWidth,
    height: targetHeight,
  };
}

// =====================================================
// CHUẨN HÓA ẢNH
// =====================================================

async function normalizeImage(
  buffer,
  target
) {
  return sharp(buffer)
    .resize({
      width: target.width,
      height: target.height,
      fit: "fill",
    })
    .ensureAlpha()
    .png()
    .toBuffer();
}

// =====================================================
// PROMPT AI EDIT
// =====================================================

function buildEditPrompt({
  editPrompt,
  content,
  designType,
  width,
  height,
  unit,
  style,
  designPlan,
}) {
  const planText =
    designPlan &&
    typeof designPlan === "object"
      ? JSON.stringify(
          designPlan,
          null,
          2
        )
      : "";

  return `
You are an expert professional advertising graphic designer
performing a CONTROLLED EDIT on an existing finished design.

The supplied image is the CURRENT FINAL DESIGN.

Your job is NOT to redesign the artwork.

Your job is NOT to create a new composition.

Your job is NOT to improve the design unless the customer
explicitly asks for improvement.

Your job is to make ONLY the change requested by the customer.

=====================================================
CUSTOMER EDIT REQUEST
=====================================================

${editPrompt}

=====================================================
ORIGINAL DESIGN INFORMATION
=====================================================

Design type:
${designType}

Final size:
${width} × ${height} ${unit}

Style:
${style}

Original design brief:
${content || ""}

Design plan:
${planText}

=====================================================
MOST IMPORTANT RULE
=====================================================

EDIT ONLY WHAT THE CUSTOMER REQUESTED.

PRESERVE EVERYTHING ELSE.

The existing design is already approved.

Do not rebuild it.

Do not redesign it.

Do not change its composition.

Do not change the layout.

Do not change the typography.

Do not rewrite text.

Do not replace text.

Do not move text.

Do not resize text unless explicitly requested.

Do not change colors that were not requested.

Do not change images that were not requested.

Do not replace people.

Do not replace products.

Do not replace logos.

Do not add decorative elements unless explicitly requested.

Do not remove decorative elements unless explicitly requested.

Do not change the visual style unless explicitly requested.

Do not change the background unless explicitly requested.

Do not crop the design.

Do not change the canvas proportions.

Do not create a new advertising concept.

=====================================================
EXAMPLES
=====================================================

If the customer says:

"Đổi nền hồng thành xanh"

ONLY change the pink background to an appropriate blue
background.

Keep the following exactly as unchanged as possible:

- all text
- text positions
- text sizes
- typography
- people
- products
- logos
- decorative objects
- composition
- proportions
- visual hierarchy

If the customer says:

"Thu nhỏ chữ KIM OANH"

ONLY make the KIM OANH text smaller.

Do not change other text.

Do not change the background.

Do not change images.

Do not change the composition.

If the customer says:

"Đổi chữ màu đỏ thành màu vàng"

ONLY change the requested red text to yellow.

Do not modify unrelated elements.

If the customer says:

"Thêm số điện thoại ở phía dưới"

ONLY add the requested phone number in the specified
location while preserving the existing design.

=====================================================
WHEN THE REQUEST IS AMBIGUOUS
=====================================================

Prefer the smallest possible modification.

Never make a large redesign.

Never change multiple elements when only one element
was requested.

=====================================================
DESIGN PRESERVATION
=====================================================

The current design should remain visually almost identical
to the supplied image except for the requested modification.

Think of this as editing a Photoshop/Corel design:

CHANGE ONE ELEMENT.

LOCK ALL OTHER ELEMENTS.

=====================================================
FINAL RESULT
=====================================================

Return the edited version of the existing artwork.

The result must look like the SAME DESIGN after a precise
professional edit.

NOT a newly generated design.
`;
}

// =====================================================
// API
// =====================================================

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    const {
      image,
      editPrompt,
      content = "",
      designType = "Backdrop",
      width,
      height,
      unit = "cm",
      style = "Hiện đại",
      designPlan = null,
    } = req.body || {};

    // =================================================
    // KIỂM TRA
    // =================================================

    if (!image) {
      return res.status(400).json({
        error:
          "Không có thiết kế để chỉnh sửa.",
      });
    }

    if (
      !editPrompt ||
      typeof editPrompt !== "string" ||
      !editPrompt.trim()
    ) {
      return res.status(400).json({
        error:
          "Vui lòng nhập yêu cầu chỉnh sửa.",
      });
    }

    const w = Number(width);
    const h = Number(height);

    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return res.status(400).json({
        error:
          "Kích thước thiết kế không hợp lệ.",
      });
    }

    // =================================================
    // KÍCH THƯỚC
    // =================================================

    const target =
      getTargetSize(w, h);

    // =================================================
    // ẢNH HIỆN TẠI
    // =================================================

    const sourceBuffer =
      dataUrlToBuffer(image);

    const normalizedInput =
      await normalizeImage(
        sourceBuffer,
        target
      );

    // =================================================
    // PROMPT
    // =================================================

    const finalPrompt =
      buildEditPrompt({
        editPrompt:
          editPrompt.trim(),
        content,
        designType,
        width: w,
        height: h,
        unit,
        style,
        designPlan,
      });

    console.log(
      "========================================"
    );

    console.log(
      "AI DESIGN PRINT - CONTROLLED EDIT"
    );

    console.log({
      editPrompt,
      designType,
      width: w,
      height: h,
      unit,
      style,
      target,
    });

    console.log(
      "========================================"
    );

    // =================================================
    // OPENAI IMAGE EDIT
    // =================================================

    const imageFile =
      await toFile(
        normalizedInput,
        "current-design.png",
        {
          type: "image/png",
        }
      );

    const response =
      await openai.images.edit({
        model: "gpt-image-2",

        image: imageFile,

        prompt: finalPrompt,

        size: "auto",

        quality: "high",

        output_format: "png",
      });

    // =================================================
    // KẾT QUẢ
    // =================================================

    const resultBase64 =
      response?.data?.[0]?.b64_json;

    if (!resultBase64) {
      throw new Error(
        "OpenAI không trả về ảnh chỉnh sửa."
      );
    }

    const resultBuffer =
      Buffer.from(
        resultBase64,
        "base64"
      );

    // =================================================
    // ĐƯA VỀ ĐÚNG KÍCH THƯỚC XỬ LÝ
    // =================================================

    const finalBuffer =
      await normalizeImage(
        resultBuffer,
        target
      );

    const finalImage =
      `data:image/png;base64,${finalBuffer.toString(
        "base64"
      )}`;

    console.log(
      "========================================"
    );

    console.log(
      "AI DESIGN PRINT - EDIT SUCCESS"
    );

    console.log({
      method:
        "CONTROLLED_EDIT",
      target,
    });

    console.log(
      "========================================"
    );

    return res.status(200).json({
      success: true,

      image: finalImage,

      width:
        target.width,

      height:
        target.height,

      targetWidth:
        target.width,

      targetHeight:
        target.height,

      ratio:
        target.width /
        target.height,

      method:
        "CONTROLLED_EDIT",

      promptVersion:
        "AI-DESIGN-PRINT-CONTROLLED-EDIT-V1",
    });
  } catch (error) {
    console.error(
      "AI DESIGN PRINT EDIT ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể chỉnh sửa thiết kế.",
    });
  }
}
