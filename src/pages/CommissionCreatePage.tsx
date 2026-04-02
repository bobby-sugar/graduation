import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

type Direction = "commission" | "offer";
type CopyrightType = "个人使用" | "商用可用" | "买断版权";
type DeliveryTime = "3天内" | "1周内" | "2周内" | "1个月内" | "可协商";
type ResponseSpeed = "不限" | "24小时内" | "12小时内" | "6小时内";

const commissionTypeOptions = ["头像", "半身", "全身", "立绘", "场景", "Live2D", "UI设计"];
const COMMISSION_TYPE_OTHER = "其他";
const PREVIEW_ASPECT = 11 / 7;

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildCropRect(naturalWidth: number, naturalHeight: number, scale: number, prev?: CropRect | null): CropRect {
  const imageAspect = naturalWidth / naturalHeight;
  const maxW = imageAspect > PREVIEW_ASPECT ? PREVIEW_ASPECT / imageAspect : 1;
  const maxH = imageAspect > PREVIEW_ASPECT ? 1 : imageAspect / PREVIEW_ASPECT;
  const frameScale = clamp(scale / 100, 0.6, 1);
  const w = maxW * frameScale;
  const h = maxH * frameScale;
  const x = prev ? clamp(prev.x, 0, 1 - w) : (1 - w) / 2;
  const y = prev ? clamp(prev.y, 0, 1 - h) : (1 - h) / 2;
  return { x, y, w, h };
}

async function buildCroppedFile(
  sourceDataUrl: string,
  cropRect: CropRect,
  fileName = `commission-cover-${Date.now()}.jpg`,
): Promise<File | null> {
  const image = new Image();
  image.src = sourceDataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("封面裁剪失败"));
  });

  const sx = Math.round(cropRect.x * image.naturalWidth);
  const sy = Math.round(cropRect.y * image.naturalHeight);
  const sw = Math.round(cropRect.w * image.naturalWidth);
  const sh = Math.round(cropRect.h * image.naturalHeight);
  const targetWidth = 1100;
  const targetHeight = Math.round(targetWidth / PREVIEW_ASPECT);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92);
  });
  if (!blob) return null;
  return new File([blob], fileName, { type: "image/jpeg" });
}

export default function CommissionCreatePage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cropEditorRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [direction, setDirection] = useState<Direction>("commission");
  const [commissionType, setCommissionType] = useState(commissionTypeOptions[0]);
  const [customCommissionType, setCustomCommissionType] = useState("");
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState<number | "">("");
  const [deliveryTime, setDeliveryTime] = useState<DeliveryTime>("1周内");
  const [copyrightType, setCopyrightType] = useState<CopyrightType>("个人使用");
  const [responseSpeed, setResponseSpeed] = useState<ResponseSpeed>("24小时内");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageNatural, setImageNatural] = useState<{ width: number; height: number } | null>(null);
  const [cropScale, setCropScale] = useState(82);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedCommissionType =
    commissionType === COMMISSION_TYPE_OTHER
      ? customCommissionType.trim()
      : commissionType;

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const src = reader.result as string;
      setImagePreview(src);
      const image = new Image();
      image.onload = () => {
        const natural = { width: image.naturalWidth, height: image.naturalHeight };
        setImageNatural(natural);
        setCropRect(buildCropRect(natural.width, natural.height, cropScale));
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleCropScaleChange = (nextScale: number) => {
    setCropScale(nextScale);
    if (!imageNatural) return;
    setCropRect((prev) => buildCropRect(imageNatural.width, imageNatural.height, nextScale, prev));
  };

  const handleCropMouseDown = (clientX: number, clientY: number) => {
    if (!cropRect) return;
    dragStartRef.current = { x: clientX, y: clientY, originX: cropRect.x, originY: cropRect.y };
    setIsDraggingCrop(true);
  };

  const handleCropMouseMove = (clientX: number, clientY: number) => {
    if (!isDraggingCrop || !cropRect || !cropEditorRef.current || !dragStartRef.current) return;
    const editorRect = cropEditorRef.current.getBoundingClientRect();
    const deltaX = (clientX - dragStartRef.current.x) / editorRect.width;
    const deltaY = (clientY - dragStartRef.current.y) / editorRect.height;
    const nextX = clamp(dragStartRef.current.originX + deltaX, 0, 1 - cropRect.w);
    const nextY = clamp(dragStartRef.current.originY + deltaY, 0, 1 - cropRect.h);
    setCropRect((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
  };

  const stopCropDrag = () => {
    setIsDraggingCrop(false);
    dragStartRef.current = null;
  };

  const mergedDescription = useMemo(() => {
    const tags = [
      `稿件类型：${resolvedCommissionType || "未填"}`,
      `金额：${budget || "未填"}`,
      `交付时间：${deliveryTime}`,
      `版权：${copyrightType}`,
      `响应速度：${responseSpeed}`,
    ];

    return [description.trim(), "", "【筛选信息】", ...tags].filter(Boolean).join("\n");
  }, [
    resolvedCommissionType,
    budget,
    deliveryTime,
    copyrightType,
    responseSpeed,
    description,
  ]);

  const payloadPrice = useMemo(() => {
    const value = typeof budget === "number" ? budget : NaN;
    if (!Number.isNaN(value) && value > 0) return value;
    return 1;
  }, [budget]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("请先登录后再发布稿件");
      return;
    }
    const missingFields: string[] = [];
    if (!imageFile) missingFields.push("封面图片");
    if (!title.trim()) missingFields.push("标题");
    if (typeof budget !== "number" || Number.isNaN(budget) || budget <= 0) missingFields.push("金额");
    if (!description.trim()) missingFields.push("详细说明");
    if (commissionType === COMMISSION_TYPE_OTHER && !customCommissionType.trim()) missingFields.push("稿件类型（其他）");
    if (missingFields.length > 0) {
      setError(`请填写完整信息：${missingFields.join("、")}`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      let previewImageUrl: string | null = null;
      if (imageFile) {
        let uploadFile: File = imageFile;
        if (imagePreview && cropRect) {
          const croppedFile = await buildCroppedFile(imagePreview, cropRect);
          if (croppedFile) {
            uploadFile = croppedFile;
          }
        }
        if (!token) {
          throw new Error("上传图片需要先登录");
        }
        const uploadFormData = new FormData();
        uploadFormData.append("file", uploadFile);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: uploadFormData,
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(errText || "图片上传失败");
        }
        const uploadData = await uploadRes.json();
        previewImageUrl = uploadData.url ?? null;
      }

      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          price: payloadPrice,
          category: resolvedCommissionType || COMMISSION_TYPE_OTHER,
          description: mergedDescription || null,
          direction,
          previewImageUrl,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "创建失败");
      }
      const data = await res.json();
      // 创建成功后跳转到详情页或返回广场
      if (data?.id) {
        navigate(`/commissions/${data.id}`);
      } else {
        navigate("/commissions");
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError(err.message || "创建失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="commission-create-page">
      <div className="commission-create-card">
        <button className="commission-detail-back" onClick={() => navigate(-1)}>
          返回
        </button>

        <div className="commission-create-title-row">
          <h1 className="commission-create-title">
            {direction === "offer" ? "发布接稿" : "发布约稿"}
          </h1>
          <button
            type="button"
            className="commission-create-switch-type-btn"
            onClick={() => setDirection((prev) => (prev === "offer" ? "commission" : "offer"))}
          >
            {direction === "offer" ? "切换为发布约稿" : "切换为发布接稿"}
          </button>
        </div>

        <form className="commission-create-form" onSubmit={handleSubmit}>
          <div className="commission-create-field">
            <label className="commission-create-label">封面图片</label>
            <div className="commission-create-image-row">
              <div className="commission-create-image-preview-wrap">
                {imagePreview ? (
                  <div className="commission-create-image-live-preview">
                    <img
                      src={imagePreview}
                      alt="封面预览"
                      className="commission-create-image-preview"
                      style={
                        cropRect
                          ? {
                              width: `${100 / cropRect.w}%`,
                              height: `${100 / cropRect.h}%`,
                              transform: `translate(${-((cropRect.x * 100) / cropRect.w)}%, -${((cropRect.y * 100) / cropRect.h)}%)`,
                              transformOrigin: "top left",
                            }
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <div className="commission-create-image-placeholder">暂无图片</div>
                )}
              </div>
              <div className="commission-create-image-actions">
                <button
                  className="commission-create-direction-btn"
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                >
                  {imagePreview ? "更换图片" : "选择图片"}
                </button>
                {imagePreview && (
                  <button
                    className="commission-create-direction-btn"
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      setImageNatural(null);
                      setCropRect(null);
                      setCropScale(82);
                      if (imageInputRef.current) imageInputRef.current.value = "";
                    }}
                  >
                    删除图片
                  </button>
                )}
                <p className="commission-create-hint">支持 jpg/png/webp，建议小于 10MB</p>
              </div>
            </div>
            {imagePreview && cropRect && (
              <div className="commission-create-crop-box">
                <div className="commission-create-crop-head">
                  <span>框选显示区域</span>
                  <span>{cropScale}%</span>
                </div>
                <div
                  ref={cropEditorRef}
                  className="commission-create-crop-editor"
                  onMouseMove={(e) => handleCropMouseMove(e.clientX, e.clientY)}
                  onMouseUp={stopCropDrag}
                  onMouseLeave={stopCropDrag}
                  onTouchMove={(e) => {
                    const touch = e.touches[0];
                    if (!touch) return;
                    handleCropMouseMove(touch.clientX, touch.clientY);
                  }}
                  onTouchEnd={stopCropDrag}
                >
                  <img src={imagePreview} alt="裁剪原图" className="commission-create-crop-image" />
                  <div
                    className={`commission-create-crop-frame ${isDraggingCrop ? "dragging" : ""}`}
                    style={{
                      left: `${cropRect.x * 100}%`,
                      top: `${cropRect.y * 100}%`,
                      width: `${cropRect.w * 100}%`,
                      height: `${cropRect.h * 100}%`,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleCropMouseDown(e.clientX, e.clientY);
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (!touch) return;
                      handleCropMouseDown(touch.clientX, touch.clientY);
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={60}
                  max={100}
                  step={1}
                  value={cropScale}
                  onChange={(e) => handleCropScaleChange(Number(e.target.value))}
                  className="commission-create-crop-slider"
                />
                <p className="commission-create-hint">拖动框选区域，发布后将按该区域作为封面显示</p>
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: "none" }}
            />
          </div>

          <div className="commission-create-field">
            <label className="commission-create-label">稿件类型</label>
            <select
              className="commission-create-input"
              value={commissionType}
              onChange={(e) => setCommissionType(e.target.value)}
            >
              {[...commissionTypeOptions, COMMISSION_TYPE_OTHER].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {commissionType === COMMISSION_TYPE_OTHER && (
              <input
                className="commission-create-input"
                placeholder="请填写类型"
                value={customCommissionType}
                onChange={(e) => setCustomCommissionType(e.target.value)}
              />
            )}
          </div>

          <div className="commission-create-field">
            <label className="commission-create-label">标题</label>
            <input
              className="commission-create-input"
              placeholder="请填写标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="commission-create-field">
            <label className="commission-create-label">金额（¥）</label>
            <input
              type="number"
              className="commission-create-input"
              placeholder="请填写金额"
              value={budget}
              onChange={(e) => setBudget(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div className="commission-create-grid">
            <div className="commission-create-field">
              <label className="commission-create-label">交付时间</label>
              <select
                className="commission-create-input"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value as DeliveryTime)}
              >
                {["3天内", "1周内", "2周内", "1个月内", "可协商"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="commission-create-field">
              <label className="commission-create-label">版权</label>
              <select
                className="commission-create-input"
                value={copyrightType}
                onChange={(e) => setCopyrightType(e.target.value as CopyrightType)}
              >
                {["个人使用", "商用可用", "买断版权"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="commission-create-field">
              <label className="commission-create-label">响应速度</label>
              <select
                className="commission-create-input"
                value={responseSpeed}
                onChange={(e) => setResponseSpeed(e.target.value as ResponseSpeed)}
              >
                {["不限", "24小时内", "12小时内", "6小时内"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="commission-create-field">
            <label className="commission-create-label">详细说明</label>
            <textarea
              className="commission-create-textarea"
              placeholder="可以描述画风，尺寸，用途等"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
            />
          </div>

          {error && <p className="commission-create-error">{error}</p>}

          <button className="commission-create-submit" type="submit" disabled={submitting}>
            {submitting ? "发布中..." : (direction === "offer" ? "发布接稿" : "发布约稿")}
          </button>
        </form>
      </div>
    </div>
  );
}

