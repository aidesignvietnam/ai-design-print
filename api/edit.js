import OpenAI from "openai";
import sharp from "sharp";

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
      targetWidth,
      targetHeight,
    } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "Không có ảnh gốc để chỉnh sửa.",
      });
    }

    if (!editPrompt || !editPrompt.trim()) {
      return res.status(400).json({
        error: "Vui lòng nhập yêu cầu chỉnh sửa.",
      });
    }

    /*
     * ---------------------------------------------------------
     * 1. CHUYỂN DATA URL THÀNH BUFFER
     * ---------------------------------------------------------
     */

    let imageBuffer;

    try {
      if (image.startsWith("data:")) {
        const base64Data = image.split(",")[1];

        if (!base64Data) {
          throw new Error("Dữ liệu ảnh không hợp lệ.");
        }

        imageBuffer = Buffer.from(base64Data, "base64");
      } else {
        imageBuffer = Buffer.from(image, "base64");
      }
    } catch (error) {
      return res.status(400).json({
        error: "Không thể đọc ảnh gốc.",
      });
    }

    /*
     * ---------------------------------------------------------
     * 2. KIỂM TRA KÍCH THƯỚC ẢNH
     * ---------------------------------------------------------
     */

    const originalMetadata = await sharp(imageBuffer).metadata();

    const originalWidth = originalMetadata.width || 0;
    const originalHeight = originalMetadata.height || 0;

    if (!originalWidth || !originalHeight) {
      return res.status(400).json({
        error: "Không xác định được kích thước ảnh.",
      });
    }

    const originalRatio =
      originalWidth / originalHeight;

    /*
     * ---------------------------------------------------------
     * 3. CHỈNH SỬA ẢNH BẰNG AI
     * ---------------------------------------------------------
     */

    const aiPrompt = `
You are an image editing assistant for a professional advertising
and large-format printing design tool.

EDIT THE PROVIDED ORIGINAL IMAGE.

IMPORTANT RULES:

1. Preserve the original design and composition.
2. Do not redesign the entire artwork.
3. Do not replace the original design with an unrelated image.
4. Preserve existing people, products, logos, typography,
   colors and visual identity unless explicitly requested.
5. Do not stretch, squash or distort any object.
6. Do not stretch or distort people.
7. Do not stretch or distort logos.
8. Do not stretch or distort typography.
9. Do not invent new wording.
10. Do not randomly add objects.
11. Keep the original visual hierarchy.
12. Maintain professional advertising quality.
13. Keep edges clean and suitable for large-format printing.

ASPECT-RATIO RULE:

If the requested composition requires more horizontal space,
extend the BACKGROUND naturally.

Do NOT stretch the original objects to fill the additional space.

When extending the background:
- continue gradients naturally,
- continue lighting naturally,
- continue scenery naturally,
- continue decorative patterns naturally,
- maintain the same color palette,
- maintain the same perspective,
- keep the main subject undistorted,
- keep important text undistorted.

The additional area should look like a natural continuation
of the original design.

USER EDIT REQUEST:
${editPrompt.trim()}
`;

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: imageBuffer,
      prompt: aiPrompt,
    });

    const editedBase64 =
      response.data?.[0]?.b64_json;

    if (!editedBase64) {
      throw new Error(
        "OpenAI không trả về ảnh chỉnh sửa."
      );
    }

    let editedBuffer = Buffer.from(
      editedBase64,
      "base64"
    );

    /*
     * ---------------------------------------------------------
     * 4. KIỂM TRA ẢNH SAU KHI AI CHỈNH SỬA
     * ---------------------------------------------------------
     */

    const editedMetadata =
      await sharp(editedBuffer).metadata();

    const editedWidth =
      editedMetadata.width || originalWidth;

    const editedHeight =
      editedMetadata.height || originalHeight;

    /*
     * ---------------------------------------------------------
     * 5. NẾU FRONTEND GỬI KÍCH THƯỚC MỤC TIÊU
     *
     * Ví dụ:
     * 400 × 70
     *
     * targetRatio = 5.714:1
     *
     * Tuyệt đối không resize méo ảnh.
     * Chúng ta dùng contain + mở rộng canvas.
     * ---------------------------------------------------------
     */

    const tw = Number(targetWidth);
    const th = Number(targetHeight);

    let finalBuffer = editedBuffer;
    let finalWidth = editedWidth;
    let finalHeight = editedHeight;

    if (
      Number.isFinite(tw) &&
      Number.isFinite(th) &&
      tw > 0 &&
      th > 0
    ) {
      /*
       * Chuyển tỷ lệ vật lý sang tỷ lệ canvas.
       *
       * Không dùng chính số cm/mm làm pixel.
       * Chỉ lấy tỷ lệ W/H.
       */

      const targetRatio = tw / th;

      const currentRatio =
        editedWidth / editedHeight;

      const ratioDifference =
        Math.abs(
          currentRatio - targetRatio
        ) / targetRatio;

      /*
       * Nếu tỷ lệ đã gần đúng thì giữ nguyên.
       */

      if (ratioDifference > 0.01) {
        /*
         * Tạo canvas đủ lớn để giữ toàn bộ ảnh.
         *
         * Ảnh được FIT INSIDE.
         * Không bao giờ stretch.
         */

        const baseCanvasWidth = 2400;
        const baseCanvasHeight =
          Math.max(
            1,
            Math.round(
              baseCanvasWidth /
                targetRatio
            )
          );

        const scale = Math.min(
          baseCanvasWidth / editedWidth,
          baseCanvasHeight / editedHeight
        );

        const fittedWidth = Math.max(
          1,
          Math.round(
            editedWidth * scale
          )
        );

        const fittedHeight = Math.max(
          1,
          Math.round(
            editedHeight * scale
          )
        );

        /*
         * Resize ảnh theo kiểu contain.
         * Tuyệt đối không méo.
         */

        const fittedImage =
          await sharp(editedBuffer)
            .resize({
              width: fittedWidth,
              height: fittedHeight,
              fit: "contain",
            })
            .png()
            .toBuffer();

        /*
         * Tạo background từ chính ảnh,
         * phóng lớn + blur để phần mở rộng
         * không trở thành các dải trắng.
         */

        const background =
          await sharp(editedBuffer)
            .resize({
              width: baseCanvasWidth,
              height: baseCanvasHeight,
              fit: "cover",
              position: "centre",
            })
            .blur(35)
            .modulate({
              brightness: 0.8,
              saturation: 0.9,
            })
            .png()
            .toBuffer();

        /*
         * Đặt artwork nguyên vẹn vào chính giữa.
         */

        const left =
          Math.max(
            0,
            Math.round(
              (baseCanvasWidth -
                fittedWidth) /
                2
            )
          );

        const top =
          Math.max(
            0,
            Math.round(
              (baseCanvasHeight -
                fittedHeight) /
                2
            )
          );

        finalBuffer =
          await sharp(background)
            .composite([
              {
                input: fittedImage,
                left,
                top,
              },
            ])
            .png()
            .toBuffer();

        finalWidth =
          baseCanvasWidth;

        finalHeight =
          baseCanvasHeight;
      }
    }

    /*
     * ---------------------------------------------------------
     * 6. KIỂM TRA TỶ LỆ CUỐI CÙNG
     * ---------------------------------------------------------
     */

    const finalMetadata =
      await sharp(finalBuffer).metadata();

    finalWidth =
      finalMetadata.width || finalWidth;

    finalHeight =
      finalMetadata.height || finalHeight;

    const finalRatio =
      finalHeight > 0
        ? finalWidth / finalHeight
        : 0;

    /*
     * ---------------------------------------------------------
     * 7. TRẢ KẾT QUẢ
     * ---------------------------------------------------------
     */

    return res.status(200).json({
      image:
        `data:image/png;base64,${finalBuffer.toString(
          "base64"
        )}`,

      originalWidth,
      originalHeight,
      originalRatio,

      editedWidth,
      editedHeight,

      finalWidth,
      finalHeight,
      finalRatio,

      targetWidth:
        Number.isFinite(tw) ? tw : null,

      targetHeight:
        Number.isFinite(th) ? th : null,

      targetRatio:
        Number.isFinite(tw) &&
        Number.isFinite(th) &&
        tw > 0 &&
        th > 0
          ? tw / th
          : null,
    });

  } catch (error) {
    console.error(
      "EDIT ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể chỉnh sửa thiết kế.",
    });
  }
}
