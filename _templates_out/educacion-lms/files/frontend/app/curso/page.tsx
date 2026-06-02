import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

const CursoPage = () => {
  const [cursos, setCursos] = useState([]);
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock';

  useEffect(() => {
    const fetchCursos = async () => {
      try {
        const response = await axios.get(`${apiUrl}/curso`);
        setCursos(response.data);
      } catch (error) {
        console.error('Error fetching cursos:', error);
      }
    };
    fetchCursos();
  }, [apiUrl]);

  const handleCreate = () => {
    router.push('/curso/new');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Cursos</h1>
      <button onClick={handleCreate} className="bg-blue-500 text-white px-4 py-2 rounded">
        Nuevo Curso
      </button>
      <div className="mt-4">
        {cursos.map(curso => (
          <div key={curso.id} className="border p-4 mb-2">
            <h2 className="text-xl">{curso.title}</h2>
            <p>{curso.description}</p>
            <button onClick={() => router.push(`/curso/${curso.id}`)} className="text-blue-500 underline">
              Ver Detalles
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CursoPage;