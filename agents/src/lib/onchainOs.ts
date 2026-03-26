import crypto from "crypto";
import axios, { AxiosInstance } from "axios";

const BASE_URL = process.env.ONCHAIN_OS_BASE_URL || "https://api.onchainos.okx.com";

function sign(message: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

export function createOkxClient(): AxiosInstance {
  const apiKey = process.env.OKX_API_KEY;
  const secret = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;

  if (!apiKey || !secret || !passphrase) {
    throw new Error("Missing OKX credentials");
  }

  const instance = axios.create({ baseURL: BASE_URL, timeout: 10000 });

  instance.interceptors.request.use((config) => {
    const timestamp = new Date().toISOString();
    const method = (config.method || "GET").toUpperCase();
    const path = config.url || "/";
    const body = config.data ? JSON.stringify(config.data) : "";
    const signPayload = `${timestamp}${method}${path}${body}`;
    config.headers = {
      ...(config.headers || {}),
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-SIGN": sign(signPayload, secret),
      "Content-Type": "application/json",
    };
    return config;
  });

  return instance;
}
