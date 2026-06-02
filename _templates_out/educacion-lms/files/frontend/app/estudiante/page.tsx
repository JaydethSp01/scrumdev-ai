import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

const EstudiantePage = () => {
  const [estudiantes, setEstudiantes] = useState([]);
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock';

  useEffect(() => {
    const fetchEstudiantes = async () => {
      try {
        const response = await axios.get(`${apiUrl}/estudiante`);
        setEstudiantes(response.data);
      } catch (error) {
        console.error('Error fetching estudiantes:', error);
      }
    };
    fetchEstudiantes();
  }, [apiUrl]);

  const handleCreate = () => {
    router.push('/estudiante/new');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Estudiantes</h1>
      <button onClick={handleCreate} className="bg-blue-500 text-white px-4 py-2 rounded">
        Nuevo Estudiante
      </button>
      <div className="mt-4">
        {estudiantes.map(estudiante => (
          <div key={estudiante.id} className="border p-4 mb-2">
            <h2 className="text-xl">{estudiante.name}</h2>
            <p>Email: {estudiante.email}</p>
            <button onClick={() => router.push(`/estudiante/${estudiante.id}`)} className="text-blue-500 underline">
              Ver Detalles
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EstudiantePage;