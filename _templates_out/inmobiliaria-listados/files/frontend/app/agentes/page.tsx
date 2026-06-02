import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AgentesPage = () => {
  const [agentes, setAgentes] = useState([]);

  useEffect(() => {
    const fetchAgentes = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/agentes`);
        setAgentes(response.data);
      } catch (error) {
        console.error('Error fetching agentes:', error);
      }
    };
    fetchAgentes();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Lista de Agentes</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agentes.map((agente) => (
          <div key={agente.id} className="border rounded-lg p-4 shadow">
            <h2 className="text-xl font-semibold">{agente.nombre}</h2>
            <p className="text-gray-700">Email: {agente.email}</p>
            <p className="text-gray-500">Teléfono: {agente.telefono}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentesPage;
