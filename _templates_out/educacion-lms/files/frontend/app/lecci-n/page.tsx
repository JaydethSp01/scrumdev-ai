import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

const LeccionPage = () => {
  const [lecciones, setLecciones] = useState([]);
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock';

  useEffect(() => {
    const fetchLecciones = async () => {
      try {
        const response = await axios.get(`${apiUrl}/leccion`);
        setLecciones(response.data);
      } catch (error) {
        console.error('Error fetching lecciones:', error);
      }
    };
    fetchLecciones();
  }, [apiUrl]);

  const handleCreate = () => {
    router.push('/leccion/new');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Lecciones</h1>
      <button onClick={handleCreate} className="bg-blue-500 text-white px-4 py-2 rounded">
        Nueva Lección
      </button>
      <div className="mt-4">
        {lecciones.map(leccion => (
          <div key={leccion.id} className="border p-4 mb-2">
            <h2 className="text-xl">{leccion.title}</h2>
            <p>{leccion.content}</p>
            <button onClick={() => router.push(`/leccion/${leccion.id}`)} className="text-blue-500 underline">
              Ver Detalles
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeccionPage;