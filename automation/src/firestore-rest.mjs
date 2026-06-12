const FIRESTORE_ROOT = "https://firestore.googleapis.com/v1/projects";

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function decodeValue(value) {
  if (!value) return null;
  for (const key of [
    "stringValue",
    "integerValue",
    "doubleValue",
    "booleanValue",
    "timestampValue",
    "nullValue",
  ]) {
    if (key in value) return value[key];
  }
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decodeValue);
  if (value.mapValue) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decodeValue(item)]),
    );
  }
  return null;
}

export class FirestoreRest {
  constructor({ projectId, accessToken }) {
    this.root = `${FIRESTORE_ROOT}/${projectId}/databases/(default)/documents`;
    this.headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  }

  async request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: this.headers });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Firestore REST Fehler ${response.status}: ${json?.error?.message ?? "unknown"}`);
    }
    return json;
  }

  async setDocument(collection, id, data) {
    const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
    return this.request(`${this.root}/${collection}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
  }

  async deleteDocument(collection, id) {
    const response = await fetch(`${this.root}/${collection}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!response.ok && response.status !== 404) {
      const json = await response.json().catch(() => null);
      throw new Error(`Firestore REST Fehler ${response.status}: ${json?.error?.message ?? "unknown"}`);
    }
  }

  async listDocuments(collection) {
    const documents = [];
    let pageToken = "";
    do {
      const url = new URL(`${this.root}/${collection}`);
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const json = await this.request(url);
      documents.push(
        ...(json.documents ?? []).map((document) => ({
          id: document.name.split("/").pop(),
          ...Object.fromEntries(
            Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]),
          ),
        })),
      );
      pageToken = json.nextPageToken ?? "";
    } while (pageToken);
    return documents;
  }
}
