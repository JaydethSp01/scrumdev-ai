import { useState, useEffect } from 'react';
import axios from 'axios';

const MenPage = () => {
  const [menuItems, setMenuItems] = useState([]);

  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/men`);
        setMenuItems(response.data);
      } catch (error) {
        console.error('Error fetching menu items:', error);
      }
    };
    fetchMenuItems();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Menú</h1>
      <ul className="space-y-2">
        {menuItems.map(item => (
          <li key={item.id} className="border p-4 rounded">
            <h2 className="text-xl font-semibold">{item.name}</h2>
            <p>{item.description}</p>
            <p className="text-green-600">${item.price}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MenPage;
