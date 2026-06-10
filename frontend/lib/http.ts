// Cliente HTTP centralizado con Axios (stack Taller 4).
// baseURL = API Gateway. Interceptores: agrega el Bearer token y maneja errores.
import axios from "axios";

export const API = process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://localhost:8080";

export const http = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

// Interceptor de request: agrega autenticación.
http.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("scrumdev.token");
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Interceptor de response: log básico de errores (sin lógica de negocio).
http.interceptors.response.use(
  (res) => res,
  (error) => Promise.reject(error)
);

export default http;
