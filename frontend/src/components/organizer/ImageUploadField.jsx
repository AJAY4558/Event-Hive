import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Image as ImageIcon, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { api } from '@/api/client';

const ACCEPTED_TYPES = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/webp', ['.webp']],
]);

export default function ImageUploadField({
  id,
  label,
  ratio,
  urlValue,
  uploadValue,
  onUploadChange,
  onUploadingChange,
  maxSizeMb = 10,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [localPreview, setLocalPreview] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewSource = localPreview || uploadValue?.url || urlValue;

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  useEffect(() => setPreviewFailed(false), [previewSource]);

  const clearLocalPreview = () => {
    setLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    const extension = file.name.match(/\.[^.]+$/)?.[0].toLowerCase();
    const validExtensions = ACCEPTED_TYPES.get(file.type);
    if (!validExtensions || !validExtensions.includes(extension)) {
      setError('Choose a JPG, PNG, or WebP image with a matching file type.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`Choose an image ${maxSizeMb} MB or smaller.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    clearLocalPreview();
    setLocalPreview(previewUrl);
    setPreviewFailed(false);
    setUploading(true);
    onUploadingChange(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await api.post('/events/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
        onUploadProgress: (event) => {
          if (event.total) setProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
      onUploadChange(response.data.image);
      setProgress(100);
      clearLocalPreview();
    } catch (uploadError) {
      setError(uploadError.message || 'Image upload failed. Please try again.');
      clearLocalPreview();
    } finally {
      setUploading(false);
      onUploadingChange(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openPicker = () => inputRef.current?.click();
  const onDrop = (event) => {
    event.preventDefault();
    if (!uploading) handleFile(event.dataTransfer.files?.[0]);
  };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-elevated/40 p-4 sm:p-5" aria-label={`${label} upload`}>
      <div className="grid gap-4 sm:grid-cols-[minmax(120px,0.42fr)_1fr] sm:items-center">
        <div className={`relative ${ratio} overflow-hidden rounded-xl border border-surface-border bg-surface-card`}>
          {previewSource && !previewFailed ? (
            <img src={previewSource} alt={`${label} preview`} className="h-full w-full object-cover" onError={() => setPreviewFailed(true)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-gray-600">
              <ImageIcon className="h-7 w-7" aria-hidden="true" />
              <span className="text-[10px]">{previewFailed ? 'Preview unavailable' : 'Image preview'}</span>
            </div>
          )}
          {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/60" role="status" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin text-brand-300" /><span className="sr-only">Uploading {label.toLowerCase()}</span></div>}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{label} file</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">JPG, PNG, or WebP · up to {maxSizeMb} MB</p>
          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={`Choose ${label.toLowerCase()} image file`}
            disabled={uploading}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <div
            role="button"
            tabIndex={uploading ? -1 : 0}
            aria-label={`Drop or browse to upload a ${label.toLowerCase()} image`}
            onClick={openPicker}
            onKeyDown={onKeyDown}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className="mt-3 flex min-h-[76px] cursor-pointer items-center gap-3 rounded-xl border border-dashed border-brand-400/30 bg-brand-500/5 px-3 py-3 text-left transition hover:border-brand-300/60 hover:bg-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <UploadCloud className="h-5 w-5 shrink-0 text-brand-300" aria-hidden="true" />
            <span className="text-xs leading-5 text-gray-300">Drop an image here or <span className="font-semibold text-brand-200">browse files</span></span>
          </div>
          {uploading && (
            <div className="mt-3" role="status" aria-live="polite">
              <div className="flex justify-between text-[11px] text-gray-400"><span>Uploading {label.toLowerCase()}…</span><span>{progress}%</span></div>
              <progress className="mt-1 h-1.5 w-full accent-fuchsia-500" max="100" value={progress} aria-label={`${label} upload progress`} />
            </div>
          )}
          <p className="mt-2 text-[11px] leading-5 text-gray-500">An uploaded file takes priority for this image. The URL field stays saved as a fallback.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {uploadValue && (
              <button type="button" disabled={uploading} onClick={openPicker} className="btn-secondary !px-3 !py-2 text-xs"><RefreshCw className="h-3.5 w-3.5" />Replace</button>
            )}
            {uploadValue && (
              <button type="button" disabled={uploading} onClick={() => { onUploadChange(null); setError(''); }} className="btn-ghost !px-3 !py-2 text-xs text-gray-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" />Remove upload</button>
            )}
            {uploadValue && <span className="self-center truncate text-[10px] text-gray-600">{uploadValue.originalName}</span>}
          </div>
          {error && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-red-300" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        </div>
      </div>
    </section>
  );
}
