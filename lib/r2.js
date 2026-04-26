import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutBucketCorsCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.R2_BUCKET_NAME;

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// Configure CORS for the bucket
export async function configureBucketCors() {
  try {
    await r2.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
              AllowedOrigins: ["*"],
              MaxAgeSeconds: 86400
            }
          ]
        }
      })
    );
    console.log("CORS configured for R2 bucket");
  } catch (error) {
    console.error("Failed to configure CORS for R2 bucket:", error);
  }
}

export function publicUrlForKey(key) {
  return `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export function keyFromPublicUrl(url) {
  const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  return String(url).replace(base + "/", "");
}

export async function createUploadUrl({ key, contentType }) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });

  return getSignedUrl(r2, command, { expiresIn: 60 * 10 });
}

export async function putJson(key, data) {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json"
    })
  );

  return {
    key,
    url: publicUrlForKey(key)
  };
}

export async function putObject(key, body, contentType = "application/octet-stream") {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );

  return {
    key,
    url: publicUrlForKey(key)
  };
}

export async function getJson(keyOrUrl) {
  const key = keyOrUrl.startsWith("http") ? keyFromPublicUrl(keyOrUrl) : keyOrUrl;

  const res = await r2.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );

  const text = await res.Body.transformToString();
  return JSON.parse(text);
}

export async function listObjects(prefix) {
  const objects = [];
  let ContinuationToken;

  do {
    const res = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken
      })
    );

    for (const obj of res.Contents || []) {
      objects.push({
        key: obj.Key,
        url: publicUrlForKey(obj.Key),
        uploadedAt: obj.LastModified,
        size: obj.Size
      });
    }

    ContinuationToken = res.NextContinuationToken;
  } while (ContinuationToken);

  return objects;
}

export async function deleteObject(keyOrUrl) {
  const key = keyOrUrl.startsWith("http") ? keyFromPublicUrl(keyOrUrl) : keyOrUrl;

  await r2.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );
}