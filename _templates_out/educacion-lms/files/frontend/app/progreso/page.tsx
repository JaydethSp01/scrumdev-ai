import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

const ProgresoPage = () => {
  const [progresos, setProgresos] = useState([]);
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock';

  useEffect(() => {
    const fetchProgresos = async () => {
      try {
        const response = await axios.get(`${apiUrl}/progreso`);
        setProgresos(response.data);
      } catch (error) {
        console.error('Error fetching progresos:', error);
      }
    };
    fetchProgresos();
  }, [apiUrl]);

  const handleCreate = () => {
    router.push('/progreso/new');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Progresos</h1>
      <button onClick={handleCreate} className="bg-blue-500 text-white px-4 py-2 rounded">
        Nuevo Progreso
      </button>
      <div className="mt-4">
        {progresos.map(progreso => (
          <div key={progreso.id} className="border p-4 mb-2">
            <h2 className="text-xl">Curso: {progreso.cursoId}</h2>
            <p>Estudiante: {progreso.estudianteId}</p>
            <p>Progreso: {progreso.porcentaje}%</p>
            <button onClick={() => router.push(`/progreso/${progreso.id}`)} className="text-blue-500 underline">
              Ver Detalles
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProgresoPage;