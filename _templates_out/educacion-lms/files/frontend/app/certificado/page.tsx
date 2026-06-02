import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

const CertificadoPage = () => {
  const [certificados, setCertificados] = useState([]);
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/mock';

  useEffect(() => {
    const fetchCertificados = async () => {
      try {
        const response = await axios.get(`${apiUrl}/certificado`);
        setCertificados(response.data);
      } catch (error) {
        console.error('Error fetching certificados:', error);
      }
    };
    fetchCertificados();
  }, [apiUrl]);

  const handleCreate = () => {
    router.push('/certificado/new');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Certificados</h1>
      <button onClick={handleCreate} className="bg-blue-500 text-white px-4 py-2 rounded">
        Nuevo Certificado
      </button>
      <div className="mt-4">
        {certificados.map(certificado => (
          <div key={certificado.id} className="border p-4 mb-2">
            <h2 className="text-xl">Estudiante: {certificado.estudianteId}</h2>
            <p>Curso: {certificado.cursoId}</p>
            <p>Fecha de Emisión: {certificado.fechaEmision}</p>
            <button onClick={() => router.push(`/certificado/${certificado.id}`)} className="text-blue-500 underline">
              Ver Detalles
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CertificadoPage;