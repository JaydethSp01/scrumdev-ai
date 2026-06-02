import { useState, useEffect } from 'react';
import axios from 'axios';

const VehiculoPage = () => {
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState({
    marca: '',
    modelo: '',
    matricula: ''
  });

  useEffect(() => {
    fetchVehiculos();
  }, []);

  const fetchVehiculos = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/vehiculo`);
      setVehiculos(response.data);
    } catch (error) {
      console.error('Error fetching vehiculos:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/vehiculo`, form);
      fetchVehiculos();
    } catch (error) {
      console.error('Error creating vehiculo:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Vehículos</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <input type="text" name="marca" placeholder="Marca" value={form.marca} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="modelo" placeholder="Modelo" value={form.modelo} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="matricula" placeholder="Matrícula" value={form.matricula} onChange={handleInputChange} className="border p-2" />
        <button type="submit" className="bg-blue-500 text-white p-2">Crear</button>
      </form>
      <ul>
        {vehiculos.map((vehiculo) => (
          <li key={vehiculo.id} className="p-2 border-b">
            {vehiculo.marca} {vehiculo.modelo} - {vehiculo.matricula}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VehiculoPage;
