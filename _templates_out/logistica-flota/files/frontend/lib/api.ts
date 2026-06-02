const API = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchData(resource) {
  const response = await fetch(`${API}/${resource}`);
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
}