import { useState, useEffect } from 'react';
import axios from 'axios';

const ConductorPage = () => {
  const [conductores, setConductores] = useState([]);
  const [form, setForm] = useState({
    nombre: '',
    licencia: ''
  });

  useEffect(() => {
    fetchConductores();
  }, []);

  const fetchConductores = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/conductor`);
      setConductores(response.data);
    } catch (error) {
      console.error('Error fetching conductores:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/conductor`, form);
      fetchConductores();
    } catch (error) {
      console.error('Error creating conductor:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Conductores</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <input type="text" name="nombre" placeholder="Nombre" value={form.nombre} onChange={handleInputChange} className="border p-2 mr-2" />
        <input type="text" name="licencia" placeholder="Licencia" value={form.licencia} onChange={handleInputChange} className="border p-2" />
        <button type="submit" className="bg-blue-500 text-white p-2">Crear</button>
      </form>
      <ul>
        {conductores.map((conductor) => (
          <li key={conductor.id} className="p-2 border-b">
            {conductor.nombre} - {conductor.licencia}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ConductorPage;
