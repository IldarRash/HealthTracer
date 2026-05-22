import {
  connectDeviceSchema,
  deviceConnectionSchema,
  deviceConsentSchema,
  grantDeviceConsentSchema,
  type ConnectDeviceInput,
  type DeviceConnection,
  type DeviceConsent,
  type GrantDeviceConsentInput,
} from "@health/types";
import { z } from "zod";
import { mobileEnv } from "../env";

export type ApiResult<T> = {
  data?: T;
  error?: string;
};

type ApiFetchOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function apiFetch<TSchema extends z.ZodType>(
  path: string,
  token: string,
  schema: TSchema,
  options: ApiFetchOptions = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const { method = "GET", body } = options;

  try {
    const response = await fetch(`${mobileEnv.EXPO_PUBLIC_API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorBody = await readResponseBody(response);
      const message =
        typeof errorBody === "string"
          ? errorBody
          : errorBody &&
              typeof errorBody === "object" &&
              "message" in errorBody &&
              typeof (errorBody as { message?: unknown }).message === "string"
            ? (errorBody as { message: string }).message
            : `${path} returned ${response.status}`;
      return { error: message };
    }

    const responseBody = await readResponseBody(response);
    return { data: schema.parse(responseBody) };
  } catch {
    return { error: `${path} could not be loaded` };
  }
}

export async function grantDeviceConsent(
  token: string,
  input: GrantDeviceConsentInput,
): Promise<ApiResult<DeviceConsent>> {
  const body = grantDeviceConsentSchema.parse(input);
  return apiFetch("/device-connections/consent", token, deviceConsentSchema, {
    method: "POST",
    body,
  });
}

export async function listDeviceConnections(
  token: string,
): Promise<ApiResult<DeviceConnection[]>> {
  return apiFetch("/device-connections", token, deviceConnectionSchema.array());
}

export async function connectDevice(
  token: string,
  input: ConnectDeviceInput,
): Promise<ApiResult<DeviceConnection>> {
  const body = connectDeviceSchema.parse(input);
  return apiFetch("/device-connections", token, deviceConnectionSchema, {
    method: "POST",
    body,
  });
}
