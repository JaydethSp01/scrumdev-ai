import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ClientesPage = () => {
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/clientes`);
        setClientes(response.data);
      } catch (error) {
        console.error('Error fetching clientes:', error);
      }
    };
    fetchClientes();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Lista de Clientes</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clientes.map((cliente) => (
          <div key={cliente.id} className="border rounded-lg p-4 shadow">
            <h2 className="text-xl font-semibold">{cliente.nombre}</h2>
            <p className="text-gray-700">Email: {cliente.email}</p>
            <p className="text-gray-500">Teléfono: {cliente.telefono}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientesPage;
