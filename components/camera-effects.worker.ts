import {
  FaceDetector,
  FilesetResolver,
  ImageSegmenter,
  type Detection,
} from "@mediapipe/tasks-vision";

type FrameRequest = {
  id: number;
  image: ImageBitmap;
  timestamp: number;
  detectFaces: boolean;
  segmentBackground: boolean;
};

type WorkerMessageScope = {
  onmessage: ((event: MessageEvent<FrameRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const wasmRoot =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const faceModel =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const backgroundModel =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

let filesetPromise:
  | ReturnType<typeof FilesetResolver.forVisionTasks>
  | undefined;
let faceDetector: FaceDetector | null = null;
let imageSegmenter: ImageSegmenter | null = null;
const workerScope = self as unknown as WorkerMessageScope;

function getFileset() {
  filesetPromise ??= FilesetResolver.forVisionTasks(wasmRoot);
  return filesetPromise;
}

async function ensureFaceDetector() {
  const fileset = await getFileset();
  faceDetector ??= await FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: faceModel },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.55,
  });
  return faceDetector;
}

async function ensureImageSegmenter() {
  const fileset = await getFileset();
  imageSegmenter ??= await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: backgroundModel },
    runningMode: "VIDEO",
    outputConfidenceMasks: true,
  });
  return imageSegmenter;
}

workerScope.onmessage = async (event: MessageEvent<FrameRequest>) => {
  const { id, image, timestamp, detectFaces, segmentBackground } = event.data;
  try {
    const [detector, segmenter] = await Promise.all([
      detectFaces ? ensureFaceDetector() : null,
      segmentBackground ? ensureImageSegmenter() : null,
    ]);

    const faces =
      detector?.detectForVideo(image, timestamp).detections.flatMap(
        (detection: Detection) => {
          const box = detection.boundingBox;
          if (!box || (detection.categories[0]?.score ?? 0) < 0.55) return [];
          return [
            {
              x: box.originX,
              y: box.originY,
              width: box.width,
              height: box.height,
            },
          ];
        },
      ) ?? [];

    let mask: ArrayBuffer | undefined;
    let maskWidth = 0;
    let maskHeight = 0;
    if (segmenter) {
      segmenter.segmentForVideo(image, timestamp, (result) => {
        const confidenceMask = result.confidenceMasks?.[0];
        if (!confidenceMask) return;
        maskWidth = confidenceMask.width;
        maskHeight = confidenceMask.height;
        mask = new Float32Array(
          confidenceMask.getAsFloat32Array(),
        ).buffer;
        confidenceMask.close();
      });
    }

    const response = { id, faces, mask, maskWidth, maskHeight };
    if (mask) workerScope.postMessage(response, [mask]);
    else workerScope.postMessage(response);
  } catch (error) {
    workerScope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Camera effects failed",
    });
  } finally {
    image.close();
  }
};
