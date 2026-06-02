const API = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchCourses() {
  const response = await fetch(`${API}/cursos`);
  if (response.ok) {
    return response.json();
  }
  return import('./mock').then((mod) => mod.default);
}