/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  useNavigate, 
  useParams,
  useLocation
} from 'react-router-dom';
import { 
  useJsApiLoader, 
  GoogleMap, 
  Autocomplete, 
  DirectionsService, 
  DirectionsRenderer 
} from '@react-google-maps/api';
import { 
  Search, 
  PlusCircle, 
  User, 
  MapPin, 
  Calendar, 
  Users, 
  ChevronRight, 
  Star, 
  ShieldCheck, 
  Car, 
  Info,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';

// --- Constants & Types ---

const CITIES = ["Puerto Madryn", "Trelew", "Rawson", "Gaiman", "Comodoro Rivadavia", "Esquel", "Puerto Pirámides"];
const CITY_COORDS: Record<string, { lat: number, lng: number }> = {
  "Puerto Madryn": { lat: -42.7692, lng: -65.0385 },
  "Trelew": { lat: -43.2489, lng: -65.3051 },
  "Rawson": { lat: -43.3002, lng: -65.1023 },
  "Gaiman": { lat: -43.2897, lng: -65.4924 },
  "Comodoro Rivadavia": { lat: -45.8656, lng: -67.4965 },
  "Esquel": { lat: -42.9115, lng: -71.3194 },
  "Puerto Pirámides": { lat: -42.5721, lng: -64.2834 }
};
const ICP_AVERAGE = 950; // Suggested average fuel price in Patagonia (ARS)
const GOOGLE_MAPS_LIBRARIES: any[] = ["places"];

interface Trip {
  id: string;
  driver: {
    name: string;
    photo: string;
    rating: number;
    verified: boolean;
    dniVerified: boolean;
    gender: "M" | "F" | "O";
    phone: string;
    alias: string;
    cbu: string;
    level: "Turista" | "Baquiano";
    badges: string[]; // e.g., ["Conductor Recurrente", "Embajador Ruta 3"]
    preferences: {
      mates: boolean;
      pets: boolean;
    };
  };
  origin: string;
  destination: string;
  meetingPoint: string;
  date: string;
  time: string;
  price: number;
  seatsAvailable: number;
  luggage: "Mano" | "Pequeño" | "Grande";
  car: {
    model: string;
    photo: string;
    consumption: number; // L/100km
  };
}

// --- Contexts ---

interface BookingContextType {
  searchParams: { origin: string, destination: string, onlyWomen: boolean } | null;
  setSearchParams: (params: { origin: string, destination: string, onlyWomen: boolean } | null) => void;
  selectedTrip: Trip | null;
  setSelectedTrip: (trip: Trip | null) => void;
  selectedSeat: string;
  setSelectedSeat: (seat: string) => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context) throw new Error('useBooking must be used within a BookingProvider');
  return context;
};

const BookingProvider = ({ children }: { children: React.ReactNode }) => {
  const [searchParams, setSearchParams] = useState<{ origin: string, destination: string, onlyWomen: boolean } | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<string>("");

  return (
    <BookingContext.Provider value={{ 
      searchParams, setSearchParams, 
      selectedTrip, setSelectedTrip, 
      selectedSeat, setSelectedSeat 
    }}>
      {children}
    </BookingContext.Provider>
  );
};

// --- Skeleton Components ---

const TripCardSkeleton = () => (
  <div className="glass-card rounded-[2.5rem] p-8 space-y-6 animate-pulse">
    <div className="flex gap-4 items-center">
      <div className="w-16 h-16 bg-gray-200 rounded-full"></div>
      <div className="space-y-2">
        <div className="h-4 w-32 bg-gray-200 rounded"></div>
        <div className="h-3 w-48 bg-gray-100 rounded"></div>
      </div>
    </div>
    <div className="h-24 w-full bg-gray-100 rounded-3xl"></div>
    <div className="flex justify-between items-end">
      <div className="space-y-2">
        <div className="h-3 w-20 bg-gray-100 rounded"></div>
        <div className="h-8 w-24 bg-gray-200 rounded"></div>
      </div>
      <div className="h-12 w-32 bg-primary/20 rounded-2xl"></div>
    </div>
  </div>
);

// --- Helpers ---

const calculateICPPrice = (distanceKm: number, consumption: number, fuelPrice: number, seats: number) => {
  const totalFuel = (distanceKm * consumption) / 100;
  const totalCost = totalFuel * fuelPrice;
  // Add 15% for app maintenance/insurance buffer
  return Math.round((totalCost * 1.15) / seats);
};

// --- Mock Data ---

const MOCK_TRIPS: Trip[] = [
  {
    id: '1',
    driver: {
      name: "Carlos M.",
      photo: "https://picsum.photos/seed/carlos/100/100",
      rating: 4.9,
      verified: true,
      dniVerified: true,
      gender: "M",
      phone: "+5492804123456",
      alias: "CARLOS.MARA.COCHE",
      cbu: "0000003100012345678901",
      level: "Baquiano",
      badges: ["Conductor Recurrente", "Embajador Ruta 3"],
      preferences: { mates: true, pets: false }
    },
    origin: "Puerto Madryn",
    destination: "Trelew",
    meetingPoint: "YPF Centro (28 de Julio)",
    date: "2024-04-20",
    time: "08:30",
    price: 1250,
    seatsAvailable: 3,
    luggage: "Pequeño",
    car: {
      model: "Toyota Corolla",
      photo: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=800&auto=format&fit=crop",
      consumption: 8
    }
  },
  {
    id: '2',
    driver: {
      name: "Lucía G.",
      photo: "https://picsum.photos/seed/lucia/100/100",
      rating: 4.7,
      verified: true,
      dniVerified: true,
      gender: "F",
      phone: "+5492804654321",
      alias: "LUCIA.VIAJES",
      cbu: "0000003100098765432101",
      level: "Turista",
      badges: ["Puntual"],
      preferences: { mates: true, pets: true }
    },
    origin: "Comodoro Rivadavia",
    destination: "Puerto Madryn",
    meetingPoint: "La Anónima (San Martín)",
    date: "2024-04-21",
    time: "07:00",
    price: 4500,
    seatsAvailable: 2,
    luggage: "Grande",
    car: {
      model: "VW Gol",
      photo: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=800&auto=format&fit=crop",
      consumption: 7
    }
  },
  {
    id: '3',
    driver: {
      name: "Andrés P.",
      photo: "https://picsum.photos/seed/andres/100/100",
      rating: 4.8,
      verified: true,
      dniVerified: true,
      gender: "M",
      phone: "+5492804998877",
      alias: "ANDRES.RUTA.3",
      cbu: "0000003100055566677701",
      level: "Baquiano",
      badges: ["Conductor Recurrente"],
      preferences: { mates: false, pets: true }
    },
    origin: "Puerto Pirámides",
    destination: "Puerto Madryn",
    meetingPoint: "Segunda Bajada",
    date: "2024-04-22",
    time: "18:00",
    price: 1800,
    seatsAvailable: 4,
    luggage: "Mano",
    car: {
      model: "Ford Ranger",
      photo: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=800&auto=format&fit=crop",
      consumption: 12
    }
  }
];

// --- Components ---

const WeatherWidget = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-amber-50 border border-amber-200 p-4 rounded-3xl flex items-center gap-4 shadow-sm"
    >
      <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
        <AlertCircle size={24} />
      </div>
      <div>
        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Alerta Meteorológica</p>
        <p className="text-sm font-bold text-amber-900">Viento fuerte en Ruta 3 (65 km/h). Circule con precaución.</p>
      </div>
    </motion.div>
  );
};

const VerifiedBadge = ({ text = "DNI Verificado" }: { text?: string }) => {
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsValidating(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm cursor-help relative group transition-colors duration-500 ${
        isValidating 
          ? 'bg-gray-50 text-gray-400 border-gray-100' 
          : 'bg-emerald-50 text-emerald-600 border-emerald-100'
      }`}
    >
      {isValidating ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <ShieldCheck size={12} />
        </motion.div>
      ) : (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <CheckCircle2 size={12} className="text-emerald-500" />
        </motion.div>
      )}
      <span>{isValidating ? "Validando..." : text}</span>
      
      {!isValidating && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark text-white text-[9px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck size={10} className="text-emerald-400" />
            <span>Identidad validada vía RENAPER</span>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-dark"></div>
        </div>
      )}
    </motion.div>
  );
};

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  return (
    <header className="relative z-50 bg-transparent text-contrast">
      <div className="max-w-7xl mx-auto px-6 h-24 md:h-32 flex items-center justify-between">
        <div 
          className="flex items-center cursor-pointer" 
          onClick={() => navigate('/')}
        >
          <div className="h-16 md:h-24 overflow-visible flex items-center">
            <img 
              src="https://i.imgur.com/mourBUd.jpeg" 
              alt="La Mara en Coche" 
              className="h-full w-auto object-contain scale-110 md:scale-150 origin-left transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

      {/* Desktop Nav */}
      <nav className="hidden md:flex items-center gap-8">
        <button 
          onClick={() => navigate('/')} 
          className={`text-sm font-semibold transition-colors ${path === '/' || path.startsWith('/results') ? 'text-primary font-black' : 'text-gray-500 hover:text-dark'}`}
        >
          Buscar Viajes
        </button>
        <button 
          onClick={() => navigate('/publish')} 
          className={`text-sm font-semibold transition-colors ${path === '/publish' ? 'text-primary font-black' : 'text-gray-500 hover:text-dark'}`}
        >
          Publicar
        </button>
        <button 
          onClick={() => navigate('/profile')} 
          className={`flex items-center gap-2 bg-gray-50 border border-gray-100 py-2 px-4 rounded-full hover:bg-gray-100 transition-colors ${path === '/profile' ? 'ring-2 ring-primary bg-white shadow-sm' : ''}`}
        >
          <User size={18} className="text-gray-500" />
          <span className="text-sm font-bold text-dark">Mi Perfil</span>
        </button>
      </nav>

      {/* Mobile Profile Icon */}
      <button 
        onClick={() => navigate('/profile')}
        className="md:hidden w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200"
        aria-label="Ir a mi perfil"
      >
        <User size={20} className="text-gray-500" />
      </button>
    </div>
  </header>
  );
};

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  return (
  <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around items-center h-16 safe-bottom z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
    <button onClick={() => navigate('/')} className={`nav-item ${path === '/' || path.startsWith('/results') ? 'active text-primary' : 'text-gray-400'}`}>
      <Search size={22} />
      <span className="text-[10px] font-black uppercase tracking-tighter">Buscar</span>
    </button>
    <button onClick={() => navigate('/publish')} className={`nav-item ${path === '/publish' ? 'active text-primary' : 'text-gray-400'}`}>
      <PlusCircle size={22} />
      <span className="text-[10px] font-black uppercase tracking-tighter">Publicar</span>
    </button>
    <button onClick={() => navigate('/profile')} className={`nav-item ${path === '/profile' ? 'active text-primary' : 'text-gray-400'}`}>
      <User size={22} />
      <span className="text-[10px] font-black uppercase tracking-tighter">Perfil</span>
    </button>
  </nav>
  );
};

const HomeScreen = ({ onSearch, isLoaded }: { onSearch: (o: string, d: string, w: boolean) => void, isLoaded: boolean }) => {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [onlyWomen, setOnlyWomen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const onOriginLoad = (autocomplete: google.maps.places.Autocomplete) => {
    originAutocompleteRef.current = autocomplete;
  };

  const onDestLoad = (autocomplete: google.maps.places.Autocomplete) => {
    destAutocompleteRef.current = autocomplete;
  };

  const onOriginPlaceChanged = () => {
    if (originAutocompleteRef.current !== null) {
      const place = originAutocompleteRef.current.getPlace();
      if (place.formatted_address) setOrigin(place.formatted_address);
    }
  };

  const onDestPlaceChanged = () => {
    if (destAutocompleteRef.current !== null) {
      const place = destAutocompleteRef.current.getPlace();
      if (place.formatted_address) setDestination(place.formatted_address);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-4 md:py-8">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <header className="space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest">
              <ShieldCheck size={14} />
              EL PRIMER CARPOOLING PATAGÓNICO
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-black text-dark leading-tight uppercase">
              Viajá por Chubut <br />
              <span className="text-primary">compartiendo gastos.</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-md font-medium">
              Conectamos conductores con viajeros de forma ágil, segura y económica.
            </p>
          </div>
        </header>

        <div className="glass-card rounded-[2.5rem] p-8 space-y-6 relative">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2 relative">
              <label className="text-xs font-black text-gray-400 uppercase ml-2 tracking-widest">Origen</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-primary z-10" size={20} />
                {isLoaded ? (
                  <Autocomplete 
                    onLoad={onOriginLoad} 
                    onPlaceChanged={onOriginPlaceChanged}
                    options={{ componentRestrictions: { country: "ar" } }}
                  >
                    <input 
                      type="text"
                      placeholder="¿Desde dónde?"
                      className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary font-bold"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                    />
                  </Autocomplete>
                ) : (
                  <input 
                    type="text"
                    placeholder="Cargando mapas..."
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary font-bold opacity-50"
                    disabled
                  />
                )}
              </div>
            </div>
            <div className="space-y-2 relative">
              <label className="text-xs font-black text-gray-400 uppercase ml-2 tracking-widest">Destino</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={20} />
                {isLoaded ? (
                  <Autocomplete 
                    onLoad={onDestLoad} 
                    onPlaceChanged={onDestPlaceChanged}
                    options={{ componentRestrictions: { country: "ar" } }}
                  >
                    <input 
                      type="text"
                      placeholder="¿A dónde vas?"
                      className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary font-bold"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                    />
                  </Autocomplete>
                ) : (
                  <input 
                    type="text"
                    placeholder="Cargando mapas..."
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary font-bold opacity-50"
                    disabled
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase ml-2">Fecha</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input 
                  type="date" 
                  min={today}
                  className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary font-bold" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase ml-2">Pasajeros</label>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input type="number" min="1" max="4" defaultValue="1" className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary font-bold" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-2">
            <button 
              onClick={() => setOnlyWomen(!onlyWomen)}
              className={`w-12 h-6 rounded-full transition-colors relative ${onlyWomen ? 'bg-pink-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${onlyWomen ? 'left-7' : 'left-1'}`}></div>
            </button>
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Solo conductoras (Mujeres)</span>
          </div>

          <button 
            onClick={() => onSearch(origin, destination, onlyWomen)}
            className="btn-primary w-full py-5 text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
          >
            <Search size={22} />
            Buscar Viaje
          </button>
        </div>
      </div>

      <div className="mt-24">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-display font-bold">Rutas Frecuentes</h2>
          <button className="text-primary font-bold text-sm flex items-center gap-1">
            Ver todas <ArrowRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { route: "Madryn - Trelew", price: 1250, img: "https://i.imgur.com/4PxV1x4.jpeg" },
            { route: "Trelew - Madryn", price: 1250, img: "https://i.imgur.com/Ho8qET6.jpeg" },
            { route: "Comodoro - Trelew", price: 4200, img: "https://i.imgur.com/fp47MWr.jpeg" },
            { route: "Pirámides - Madryn", price: 1800, img: "https://i.imgur.com/aH8H2Nz.jpeg", pos: "center 70%" },
            { route: "Rawson - Trelew", price: 850, img: "https://i.imgur.com/3800qaT.jpeg" },
            { route: "Esquel - Trelew", price: 6500, img: "https://i.imgur.com/MtvHlir.jpeg" },
          ].map((item, i) => (
            <div key={i} className="group cursor-pointer">
              <div className="relative h-48 rounded-3xl overflow-hidden mb-4">
                <img 
                  src={item.img} 
                  alt={item.route} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  style={{ objectPosition: (item as any).pos || 'center' }}
                  referrerPolicy="no-referrer" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-dark/60 to-transparent"></div>
                <div className="absolute bottom-4 left-4">
                  <p className="text-white font-bold">{item.route}</p>
                  <p className="text-primary text-xs font-bold">Desde ${item.price}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ResultsScreen = ({ origin, destination, onlyWomen, onBack, onSelectTrip }: { origin: string, destination: string, onlyWomen: boolean, onBack: () => void, onSelectTrip: (t: Trip) => void }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const filteredTrips = MOCK_TRIPS.filter(trip => {
    if (onlyWomen && trip.driver.gender !== 'F') return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <button onClick={onBack} className="mb-8 text-gray-500 flex items-center gap-2 hover:text-dark transition-colors group">
        <ChevronRight className="rotate-180 group-hover:-translate-x-1 transition-transform" size={20} />
        <span className="font-bold uppercase tracking-widest text-xs">Volver al buscador</span>
      </button>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h2 className="text-4xl font-display font-black text-dark uppercase tracking-tight">
            {origin && destination ? `${origin} a ${destination}` : "Viajes disponibles"}
          </h2>
          <p className="text-gray-500 mt-1 font-medium">Encontramos {loading ? "buscando..." : filteredTrips.length} opciones para hoy</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-gray-100 text-dark text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full">Más económico</button>
          <button className="bg-dark text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full">Más temprano</button>
        </div>
      </div>

      <div className="space-y-6">
        {loading ? (
          <>
            <TripCardSkeleton />
            <TripCardSkeleton />
            <TripCardSkeleton />
          </>
        ) : (
          filteredTrips.map(trip => (
            <motion.div 
              key={trip.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onSelectTrip(trip)}
              className="glass-card rounded-[2.5rem] p-6 md:p-8 hover:border-primary/50 transition-all cursor-pointer group hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-6">
                    <img src={trip.driver.photo} alt={trip.driver.name} className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-lg" referrerPolicy="no-referrer" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-black text-dark uppercase">{trip.driver.name}</p>
                        <VerifiedBadge />
                        {trip.driver.badges.map(badge => (
                          <div key={badge} className="flex items-center gap-1 bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100">
                            <Star size={10} className="fill-amber-600" />
                            {badge}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <div className="flex items-center gap-1">
                          <Star size={14} className="text-primary fill-primary" />
                          <span className="font-black text-dark">{trip.driver.rating}</span>
                        </div>
                        <span className="opacity-30">•</span>
                        <span className={`font-black uppercase text-[10px] tracking-widest ${trip.driver.level === 'Baquiano' ? 'text-primary' : 'text-gray-400'}`}>{trip.driver.level}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-2xl font-black text-dark">{trip.time}</p>
                      <div className="w-1 h-12 bg-gray-100 rounded-full"></div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Llegada</p>
                    </div>
                    <div className="flex-1 space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-4 h-4 rounded-full border-4 border-primary bg-white"></div>
                        <p className="font-black text-dark uppercase tracking-tight">{trip.origin}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-4 h-4 rounded-full bg-dark"></div>
                        <p className="font-black text-dark uppercase tracking-tight">{trip.destination}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:w-56 flex flex-col justify-between items-end border-t md:border-t-0 md:border-l border-gray-100 pt-6 md:pt-0 md:pl-10">
                  <div className="text-right">
                    <p className="text-4xl font-display font-black text-dark tracking-tighter">${trip.price}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mt-1">Por asiento</p>
                  </div>
                  <div className="space-y-4 w-full">
                    <div className="flex items-center justify-end gap-2 text-gray-400">
                      <Users size={18} />
                      <span className="text-xs font-black uppercase tracking-widest">{trip.seatsAvailable} lugares</span>
                    </div>
                    <div className="flex items-center justify-end gap-2 text-gray-400">
                      <Car size={18} />
                      <span className="text-xs font-black uppercase tracking-widest">Equipaje: {trip.luggage}</span>
                    </div>
                    <button 
                      className="btn-primary w-full"
                    >
                      RESERVAR
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

const TripDetailScreen = ({ trip, onBack, onBook, isLoaded }: { trip: Trip, onBack: () => void, onBook: (t: Trip, s: string) => void, isLoaded: boolean }) => {
  const reservationFee = 350;
  const fuelCost = trip.price;
  const total = reservationFee + fuelCost;
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [distance, setDistance] = useState<string>("");
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    document.title = `Viaje de ${trip.origin} a ${trip.destination} | La Mara en Coche`;
    return () => { document.title = "La Mara en Coche | Carpooling Patagónico"; };
  }, [trip]);

  const handleSOS = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        const message = `¡EMERGENCIA! Estoy en un viaje de La Mara en Coche. Mi ubicación actual: https://www.google.com/maps?q=${latitude},${longitude}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
      }, () => {
        alert("No se pudo obtener la ubicación. Por favor, compartí tu ubicación manualmente.");
      });
    } else {
      alert("La geolocalización no está disponible en este navegador.");
    }
  };

  const onMapLoad = (map: google.maps.Map) => {
    mapRef.current = map;
  };

  const directionsCallback = useCallback((res: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (res !== null && status === 'OK') {
      setResponse(res);
      if (res.routes[0].legs[0].distance) {
        setDistance(res.routes[0].legs[0].distance.text);
      }
      
      if (mapRef.current && res.routes[0].bounds) {
        mapRef.current.fitBounds(res.routes[0].bounds);
      }
    }
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="text-gray-500 flex items-center gap-2 hover:text-dark transition-colors group">
          <ChevronRight className="rotate-180 group-hover:-translate-x-1 transition-transform" size={20} />
          <span className="font-bold uppercase tracking-widest text-xs">Volver al listado</span>
        </button>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => alert("Reporte enviado. Revisaremos este viaje a la brevedad.")}
            className="text-gray-400 hover:text-red-500 transition-colors p-2"
            title="Reportar viaje"
          >
            <AlertCircle size={20} />
          </button>
          <button 
            onClick={handleSOS}
            className="bg-red-50 text-red-600 px-6 py-3 rounded-2xl flex items-center gap-2 font-black uppercase tracking-widest text-xs border border-red-100 shadow-sm hover:bg-red-100 transition-colors active:scale-95"
          >
            <AlertCircle size={18} />
            Botón S.O.S
          </button>
        </div>
      </div>

      <div className="mb-8">
        <WeatherWidget />
      </div>

      <div className="grid lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-10">
          <div className="relative h-80 rounded-[3rem] overflow-hidden shadow-2xl group border-4 border-white">
            {isLoaded ? (
              <GoogleMap
                id="trip-map"
                mapContainerStyle={{ width: '100%', height: '100%' }}
                zoom={10}
                onLoad={onMapLoad}
                center={CITY_COORDS[trip.origin] || { lat: -43.2489, lng: -65.3051 }}
                options={{
                  disableDefaultUI: true,
                  styles: [
                    { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#212121" }] },
                    { featureType: "water", elementType: "geometry", stylers: [{ color: "#e9e9e9" }] }
                  ]
                }}
              >
                <DirectionsService
                  options={{
                    destination: trip.destination,
                    origin: trip.origin,
                    travelMode: google.maps.TravelMode.DRIVING
                  }}
                  callback={directionsCallback}
                />
                {response !== null && (
                  <DirectionsRenderer
                    options={{
                      directions: response,
                      polylineOptions: { strokeColor: "#FFC107", strokeWeight: 6 }
                    }}
                  />
                )}
              </GoogleMap>
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                <p className="font-black text-gray-400 uppercase tracking-widest">Cargando Mapa...</p>
              </div>
            )}
            
            <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md px-6 py-3 rounded-2xl shadow-xl pointer-events-none z-10">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Trayecto</p>
              <p className="font-black text-dark uppercase">{trip.origin} → {trip.destination}</p>
            </div>

            {distance && (
              <div className="absolute bottom-6 right-6 bg-dark text-white px-6 py-3 rounded-2xl shadow-xl z-10 border-2 border-primary">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Distancia Total</p>
                <p className="font-black text-lg">{distance}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-8 glass-card rounded-[2.5rem]">
            <div className="flex items-center gap-6">
              <img src={trip.driver.photo} alt={trip.driver.name} className="w-20 h-20 rounded-full border-4 border-white shadow-xl object-cover" referrerPolicy="no-referrer" />
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-black text-dark uppercase tracking-tight">{trip.driver.name}</h3>
                  <VerifiedBadge />
                  {trip.driver.badges.map(badge => (
                    <div key={badge} className="flex items-center gap-1 bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100">
                      <Star size={12} className="fill-amber-600" />
                      {badge}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    <Star size={16} className="text-primary fill-primary" />
                    <span className="font-black text-dark">{trip.driver.rating}</span>
                  </div>
                  <span className="opacity-20">•</span>
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{trip.driver.level}</span>
                </div>
              </div>
            </div>
            <div className="hidden md:flex gap-4">
              <div className={`p-4 rounded-2xl border ${trip.driver.preferences.mates ? 'bg-green-50 border-green-100 text-green-600' : 'bg-gray-50 border-gray-100 text-gray-300'}`}>
                <CheckCircle2 size={24} />
              </div>
              <div className={`p-4 rounded-2xl border ${trip.driver.preferences.pets ? 'bg-green-50 border-green-100 text-green-600' : 'bg-gray-50 border-gray-100 text-gray-300'}`}>
                <Users size={24} />
              </div>
            </div>
          </div>

          <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Elegí tu Asiento</h4>
            <div className="flex justify-center gap-4">
              {["Acompañante", "Atrás Izq", "Atrás Centro", "Atrás Der"].slice(0, trip.seatsAvailable).map((seat) => (
                <button
                  key={seat}
                  onClick={() => setSelectedSeat(seat)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${selectedSeat === seat ? 'bg-primary border-primary shadow-lg scale-105' : 'bg-white border-gray-100 hover:border-primary/30'}`}
                >
                  <User size={20} className={selectedSeat === seat ? 'text-dark' : 'text-gray-300'} />
                  <span className="text-[8px] font-black uppercase tracking-tighter text-center leading-none">{seat}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Detalles del Vehículo</h4>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-lg">
                  <img src={trip.car.photo} alt={trip.car.model} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <p className="text-lg font-black text-dark uppercase">{trip.car.model}</p>
                  <p className="text-xs font-bold text-gray-400 mt-1">Aire Acondicionado • Calefacción</p>
                </div>
              </div>
            </div>
            <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Información de Viaje</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Calendar className="text-primary" size={20} />
                  <p className="font-black text-dark uppercase text-sm">{trip.date} • {trip.time} HS</p>
                </div>
                <div className="flex items-center gap-4">
                  <Users className="text-primary" size={20} />
                  <p className="font-black text-dark uppercase text-sm">{trip.seatsAvailable} Asientos disponibles</p>
                </div>
                <div className="flex items-center gap-4">
                  <MapPin className="text-primary" size={20} />
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Punto de Encuentro</p>
                    <p className="font-black text-dark uppercase text-sm">{trip.meetingPoint}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Car className="text-primary" size={20} />
                  <p className="font-black text-dark uppercase text-sm">Equipaje: {trip.luggage}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="glass-card rounded-[3rem] p-10 sticky top-12">
            <h3 className="text-xl font-black text-dark uppercase tracking-widest mb-8">Desglose de Pago</h3>
            
            <div className="space-y-6 mb-10">
            <div className="flex justify-between items-center relative group">
              <p className="text-gray-500 font-bold flex items-center gap-1">
                Reserva vía App
                <Info size={14} className="text-gray-300" />
              </p>
              <p className="text-xl font-black text-dark">${reservationFee}</p>
              
              <div className="absolute bottom-full left-0 mb-2 w-48 p-3 bg-dark text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-white/10">
                Este monto cubre la gestión de la plataforma y el seguro del viaje.
                <div className="absolute top-full left-4 border-8 border-transparent border-t-dark"></div>
              </div>
            </div>
            <div className="flex justify-between items-center relative group">
              <p className="text-gray-500 font-bold flex items-center gap-1">
                Costo de Nafta (al subir)
                <Info size={14} className="text-gray-300" />
              </p>
              <p className="text-xl font-black text-dark">${fuelCost}</p>

              <div className="absolute bottom-full left-0 mb-2 w-48 p-3 bg-dark text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-white/10">
                Este monto se entrega directamente al conductor para cubrir gastos de combustible.
                <div className="absolute top-full left-4 border-8 border-transparent border-t-dark"></div>
              </div>
            </div>
              <div className="pt-6 border-t border-gray-100 flex justify-between items-center">
                <p className="text-lg font-black text-dark uppercase">Total</p>
                <p className="text-4xl font-display font-black text-primary tracking-tighter">${total}</p>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 mb-10">
              <p className="text-xs text-blue-800 leading-relaxed font-bold">
                Reservás con <span className="text-blue-600">${reservationFee}</span> ahora. Los <span className="text-blue-600">${fuelCost}</span> restantes se abonan directamente al conductor al subir al vehículo.
              </p>
            </div>

            <button 
              onClick={() => {
                if (!selectedSeat) {
                  alert("Por favor, elegí un asiento antes de continuar.");
                  return;
                }
                onBook(trip, selectedSeat);
              }}
              className="w-full btn-primary py-6 text-xl mb-4"
              aria-label="Reservar ahora"
            >
              RESERVAR AHORA
            </button>

            <button 
              onClick={() => {
                navigator.geolocation.getCurrentPosition((pos) => {
                  const url = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
                  navigator.clipboard.writeText(`Seguí mi viaje en tiempo real: ${url}`);
                  alert("Link de seguimiento copiado! Envialo por WhatsApp a un familiar.");
                }, () => {
                  alert("No pudimos obtener tu ubicación. Activá el GPS para compartir el seguimiento.");
                });
              }}
              className="w-full bg-white border-2 border-primary text-dark py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors"
              aria-label="Compartir seguimiento en tiempo real"
            >
              <MapPin size={18} className="text-primary" />
              Compartir seguimiento en tiempo real
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PublishScreen = () => {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [seats, setSeats] = useState({ front: true, backLeft: true, backCenter: true, backRight: true });
  const [icp, setIcp] = useState(ICP_AVERAGE);
  const [luggage, setLuggage] = useState<"Mano" | "Pequeño" | "Grande">("Mano");
  const [preferences, setPreferences] = useState({ mates: true, pets: false });
  
  const distance = 65; 
  const consumption = 8; // L/100km
  const basePrice = calculateICPPrice(distance, consumption, icp, Object.values(seats).filter(Boolean).length);
  const [customPrice, setCustomPrice] = useState(basePrice);

  useEffect(() => {
    setCustomPrice(basePrice);
  }, [seats, icp]);

  const toggleSeat = (seat: keyof typeof seats) => {
    setSeats(prev => ({ ...prev, [seat]: !prev[seat] }));
  };

  const togglePreference = (pref: keyof typeof preferences) => {
    setPreferences(prev => ({ ...prev, [pref]: !prev[pref] }));
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h2 className="text-3xl font-display font-bold mb-8">Publicar un Viaje</h2>
      
      <div className="grid md:grid-cols-2 gap-12">
        <div className="space-y-8">
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ruta y Horario</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <select className="bg-gray-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary font-bold" onChange={(e) => setOrigin(e.target.value)}>
                  <option>Origen</option>
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select className="bg-gray-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary font-bold" onChange={(e) => setDestination(e.target.value)}>
                  <option>Destino</option>
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Punto de Encuentro Sugerido</label>
                <select className="w-full bg-gray-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary font-bold">
                  <option>Seleccionar punto estratégico...</option>
                  <option>La Anónima (Centro)</option>
                  <option>YPF (Ruta 3)</option>
                  <option>Terminal de Ómnibus</option>
                  <option>Plaza Central</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="date" className="bg-gray-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary font-bold" />
                <input type="time" className="bg-gray-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-primary font-bold" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Equipaje Permitido</h3>
            <div className="grid grid-cols-3 gap-3">
              {(["Mano", "Pequeño", "Grande"] as const).map((size) => (
                <button 
                  key={size}
                  onClick={() => setLuggage(size)}
                  className={`border p-4 rounded-2xl flex flex-col items-center gap-2 transition-all group ${luggage === size ? 'bg-[#FFC107] border-[#FFC107] shadow-lg scale-105' : 'bg-gray-50 border-gray-100 hover:border-primary'}`}
                >
                  <Car size={20} className={luggage === size ? 'text-dark' : 'text-gray-400 group-hover:text-primary'} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${luggage === size ? 'text-dark' : 'text-gray-400'}`}>{size}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Preferencias</h3>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => togglePreference('mates')}
                className={`p-5 rounded-3xl border flex items-center gap-4 transition-all ${preferences.mates ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
              >
                <CheckCircle2 size={24} />
                <span className="text-sm font-bold uppercase tracking-tight">Acepto Mate</span>
              </button>
              <button 
                onClick={() => togglePreference('pets')}
                className={`p-5 rounded-3xl border flex items-center gap-4 transition-all ${preferences.pets ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
              >
                <Users size={24} />
                <span className="text-sm font-bold uppercase tracking-tight">Mascotas</span>
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-end">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Precio Sugerido (ICP)</h3>
              <div className="text-right">
                <p className="text-xs text-gray-400">Basado en ICP: ${icp}</p>
                <div className="flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setCustomPrice(p => Math.max(Math.round(basePrice * 0.85), p - 50))}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                  >
                    -
                  </button>
                  <p className={`text-3xl font-display font-bold ${customPrice > basePrice * 1.1 ? 'text-red-500' : 'text-dark'}`}>
                    ${customPrice}
                  </p>
                  <button 
                    onClick={() => setCustomPrice(p => Math.min(Math.round(basePrice * 1.15), p + 50))}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 flex gap-4">
              <Info size={24} className="text-amber-500 shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-black text-amber-700 uppercase tracking-widest">Sugerencia Pro</p>
                <p className="text-sm text-amber-900/70 leading-relaxed font-medium">
                  El costo promedio de combustible para este tramo es de <span className="font-bold">${basePrice}</span> por asiento. Evitar precios abusivos aumenta tu calificación como Baquiano.
                </p>
                <p className="text-[10px] text-amber-600/50 font-bold">
                  El precio se calcula automáticamente promediando los combustibles locales (ICP).
                </p>
              </div>
            </div>
            <input 
              type="range" 
              min={Math.round(basePrice * 0.85)} 
              max={Math.round(basePrice * 1.15)} 
              value={customPrice}
              onChange={(e) => setCustomPrice(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-primary" 
            />
          </section>

          <button className="btn-primary w-full py-5 text-lg shadow-xl shadow-primary/20 hidden md:block">
            Publicar Viaje
          </button>
        </div>

        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Configuración de Asientos</h3>
            </div>
            <div className="bg-gray-50 rounded-[2.5rem] p-10 flex flex-col items-center gap-8 border border-gray-100">
               <div className="w-56 h-72 border-4 border-gray-200 rounded-[50px] relative bg-white flex flex-col p-6 gap-10 shadow-inner">
                  <div className="flex justify-between h-20">
                    <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center text-gray-300">
                      <Car size={24} />
                    </div>
                    <button 
                      onClick={() => toggleSeat('front')}
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${seats.front ? 'bg-primary text-dark shadow-lg scale-110' : 'bg-gray-50 text-gray-300'}`}
                    >
                      <User size={24} />
                    </button>
                  </div>
                  <div className="flex justify-between h-20">
                    <button 
                      onClick={() => toggleSeat('backLeft')}
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${seats.backLeft ? 'bg-primary text-dark shadow-lg scale-110' : 'bg-gray-50 text-gray-300'}`}
                    >
                      <User size={24} />
                    </button>
                    <button 
                      onClick={() => toggleSeat('backCenter')}
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${seats.backCenter ? 'bg-primary text-dark shadow-lg scale-110' : 'bg-gray-50 text-gray-300'}`}
                    >
                      <User size={24} />
                    </button>
                    <button 
                      onClick={() => toggleSeat('backRight')}
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${seats.backRight ? 'bg-primary text-dark shadow-lg scale-110' : 'bg-gray-50 text-gray-300'}`}
                    >
                      <User size={24} />
                    </button>
                  </div>
               </div>
               <div className="text-center">
                 <p className="text-lg font-bold text-dark">
                   {Object.values(seats).filter(Boolean).length} asientos
                 </p>
                 <p className="text-xs text-gray-400 font-medium mt-1">Toca los asientos para habilitarlos</p>
               </div>
            </div>
          </section>
          
          <button className="btn-primary w-full py-5 text-lg shadow-xl shadow-primary/20 md:hidden">
            Publicar Viaje
          </button>
        </div>
      </div>
    </div>
  );
};

const ProfileScreen = () => {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="glass-card rounded-[2.5rem] p-8 md:p-12">
        <div className="flex flex-col items-center mb-10">
          <div className="relative">
            <img src="https://picsum.photos/seed/user123/200/200" alt="Profile" className="w-32 h-32 rounded-full border-4 border-primary object-cover shadow-xl" referrerPolicy="no-referrer" />
            <div className="absolute -bottom-2 -right-2 bg-dark text-white p-3 rounded-full border-4 border-white shadow-lg">
              <ShieldCheck size={20} />
            </div>
          </div>
          <h2 className="text-3xl font-display font-bold mt-6">Leo Gutiérrez</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-primary text-dark font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-widest">Baquiano</span>
            <span className="text-gray-400 text-xs font-bold">• Nivel 12</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="text-center p-4">
            <p className="text-3xl font-display font-bold">4.9</p>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Rating</p>
          </div>
          <div className="text-center p-4 border-x border-gray-100">
            <p className="text-3xl font-display font-bold">128</p>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Viajes</p>
          </div>
          <div className="text-center p-4">
            <p className="text-3xl font-display font-bold">12k</p>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Kms</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-2">Seguridad y Cuenta</h3>
          
          <div className="group flex items-center justify-between p-5 bg-gray-50 rounded-3xl border border-transparent hover:border-primary/20 transition-all cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 text-green-600 rounded-2xl">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <p className="font-bold text-dark">DNI Verificado</p>
                <p className="text-xs text-gray-500">Identidad validada correctamente</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-300 group-hover:text-primary transition-colors" />
          </div>

          <div className="group flex items-center justify-between p-5 bg-gray-50 rounded-3xl border border-transparent hover:border-primary/20 transition-all cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                <Car size={24} />
              </div>
              <div>
                <p className="font-bold text-dark">Vehículo</p>
                <p className="text-xs text-gray-500">Toyota Corolla • AB 123 CD</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-300 group-hover:text-primary transition-colors" />
          </div>

          <div className="group flex items-center justify-between p-5 bg-gray-50 rounded-3xl border border-transparent hover:border-primary/20 transition-all cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl">
                <AlertCircle size={24} />
              </div>
              <div>
                <p className="font-bold text-dark">Calificaciones</p>
                <p className="text-xs text-gray-500">Tenés 2 opiniones pendientes</p>
              </div>
            </div>
            <div className="bg-orange-600 text-white text-[10px] font-bold px-3 py-1 rounded-full">2</div>
          </div>
        </div>

          <div className="bg-gray-50 rounded-[2rem] p-6 border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-2">Validación de Vehículo</h3>
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="PATENTE (EJ: AA 123 CD)" 
                  className="w-full bg-white border-2 border-gray-100 rounded-2xl p-4 font-black uppercase text-center focus:border-primary outline-none transition-all placeholder:text-gray-300"
                  maxLength={9}
                />
                <ShieldCheck size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-primary" />
              </div>
              <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold">
                <Info size={14} />
                El seguro de tu auto debe estar al día para ser Baquiano.
              </div>
            </div>
          </div>

        <button className="w-full mt-12 py-4 text-gray-400 hover:text-red-500 font-bold text-sm transition-colors">
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
};

const CheckoutScreen = ({ trip, selectedSeat, onConfirm, onCancel }: { trip: Trip, selectedSeat: string, onConfirm: () => void, onCancel: () => void }) => {
  const serviceFee = 350;
  const remainingPrice = trip.price;
  const [copied, setCopied] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleWhatsAppReceipt = () => {
    const message = `Hola ${trip.driver.name}, te contacto por el viaje de ${trip.origin} a ${trip.destination} del día ${trip.date}. Ya reservé mi asiento ${selectedSeat} a través de La Mara en Coche. ¡Nos vemos en el punto de encuentro!`;
    const whatsappUrl = `https://wa.me/${trip.driver.phone.replace('+', '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onCancel} className="text-gray-500 flex items-center gap-2 hover:text-dark transition-colors">
          <ChevronRight className="rotate-180" size={20} />
          <span className="font-semibold">Cancelar reserva</span>
        </button>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest border shadow-sm ${timeLeft < 60 ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
          <AlertCircle size={14} />
          Tu lugar está reservado por: {formatTime(timeLeft)}
        </div>
      </div>

      <div className="glass-card rounded-[2.5rem] overflow-hidden">
        <div className="bg-dark p-8 text-white">
          <h2 className="text-2xl font-display font-bold mb-2">Reserva Blindada</h2>
          <p className="text-gray-400 text-sm">Confirmá tu lugar en el viaje de {trip.driver.name}</p>
          <div className="mt-4 inline-block bg-primary text-dark px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
            Asiento: {selectedSeat}
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Bloque A: Reserva */}
          <div className="p-6 bg-blue-50 rounded-3xl border-2 border-blue-100 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Bloque A: Reserva Online</p>
                <h3 className="text-lg font-black text-blue-900 uppercase">Pago a La Mara en Coche</h3>
              </div>
              <p className="text-3xl font-display font-black text-blue-600">${serviceFee}</p>
            </div>
            
            <div className="p-4 bg-white/50 rounded-2xl border border-blue-200">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Alias de Mercado Pago</p>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-black text-blue-900">MARA.EN.COCHE.MP</span>
                <button 
                  onClick={() => handleCopy("MARA.EN.COCHE.MP", "alias")}
                  className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors"
                >
                  {copied === "alias" ? <Check size={12} /> : <Copy size={12} />}
                  {copied === "alias" ? "Copiado" : "Copiar Alias"}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-blue-500 font-bold italic">
              * Este pago confirma tu lugar y activa el seguro de viaje.
            </p>
          </div>

          {/* Bloque B: Viaje */}
          <div className="p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Bloque B: El Viaje</p>
                <h3 className="text-lg font-black text-emerald-900 uppercase">Pago al Conductor</h3>
              </div>
              <p className="text-3xl font-display font-black text-emerald-600">${remainingPrice}</p>
            </div>
            
            <div className="space-y-3">
              <div className="p-4 bg-white/50 rounded-2xl border border-emerald-200">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Alias del Conductor</p>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black text-emerald-900 break-all">{trip.driver.alias}</span>
                  <button 
                    onClick={() => handleCopy(trip.driver.alias, "driver-alias")}
                    className="shrink-0 flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors"
                  >
                    {copied === "driver-alias" ? <Check size={12} /> : <Copy size={12} />}
                    {copied === "driver-alias" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-white/50 rounded-2xl border border-emerald-200">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">CBU del Conductor</p>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black text-emerald-900 break-all font-mono">{trip.driver.cbu}</span>
                  <button 
                    onClick={() => handleCopy(trip.driver.cbu, "driver-cbu")}
                    className="shrink-0 flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors"
                  >
                    {copied === "driver-cbu" ? <Check size={12} /> : <Copy size={12} />}
                    {copied === "driver-cbu" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-emerald-500 font-bold italic">
              * El saldo restante se abona directamente al conductor {trip.driver.name}.
            </p>
          </div>

          <div className="space-y-4 pt-4">
            <button 
              onClick={handleWhatsAppReceipt}
              className="w-full bg-green-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:bg-green-600 transition-colors"
              aria-label="Confirmar por WhatsApp con el Conductor"
            >
              <Users size={20} />
              Confirmar por WhatsApp con el Conductor
            </button>
            
            <button 
              onClick={onConfirm}
              className="w-full btn-primary py-5 text-lg shadow-xl shadow-primary/20"
              aria-label="Finalizar Reserva"
            >
              Finalizar Reserva
            </button>
          </div>
          
          <p className="text-center text-[10px] text-gray-400 font-medium px-8">
            Al confirmar, aceptás nuestros términos y condiciones. El service fee no es reembolsable en caso de cancelación por parte del pasajero.
          </p>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    searchParams, setSearchParams, 
    selectedTrip, setSelectedTrip, 
    selectedSeat, setSelectedSeat 
  } = useBooking();

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
      });
    }
  }, []);

  const handleSearch = (origin: string, destination: string, onlyWomen: boolean) => {
    setSearchParams({ origin, destination, onlyWomen });
    navigate('/results');
  };

  const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    navigate(`/trip/${trip.id}`);
  };

  const handleBook = (trip: Trip, seat: string) => {
    setSelectedTrip(trip);
    setSelectedSeat(seat);
    navigate('/checkout');
  };

  useEffect(() => {
    if (selectedTrip) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.innerHTML = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Event",
        "name": `Viaje de ${selectedTrip.origin} a ${selectedTrip.destination}`,
        "startDate": `${selectedTrip.date}T${selectedTrip.time}`,
        "location": {
          "@type": "Place",
          "name": selectedTrip.origin,
          "address": selectedTrip.origin
        },
        "description": `Carpooling con ${selectedTrip.driver.name}. Asientos disponibles: ${selectedTrip.seatsAvailable}`,
        "offers": {
          "@type": "Offer",
          "price": selectedTrip.price,
          "priceCurrency": "ARS"
        }
      });
      document.head.appendChild(script);
      return () => {
        const existing = document.querySelector('script[type="application/ld+json"]');
        if (existing) document.head.removeChild(existing);
      };
    }
  }, [selectedTrip]);

  return (
    <div className="min-h-screen bg-white relative">
      <Header />
      
      <main className="pt-4 pb-24 md:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Routes location={location}>
              <Route path="/" element={<HomeScreen onSearch={handleSearch} isLoaded={isLoaded} />} />
              <Route path="/results" element={
                <ResultsScreen 
                  origin={searchParams?.origin || ""} 
                  destination={searchParams?.destination || ""} 
                  onlyWomen={searchParams?.onlyWomen || false}
                  onBack={() => navigate('/')} 
                  onSelectTrip={handleSelectTrip}
                />
              } />
              <Route path="/trip/:id" element={
                selectedTrip ? (
                  <TripDetailScreen 
                    trip={selectedTrip} 
                    onBack={() => navigate('/results')} 
                    onBook={handleBook}
                    isLoaded={isLoaded}
                  />
                ) : <HomeScreen onSearch={handleSearch} isLoaded={isLoaded} />
              } />
              <Route path="/publish" element={<PublishScreen />} />
              <Route path="/profile" element={<ProfileScreen />} />
              <Route path="/checkout" element={
                selectedTrip ? (
                  <CheckoutScreen 
                    trip={selectedTrip} 
                    selectedSeat={selectedSeat}
                    onConfirm={() => {
                      alert("¡Reserva confirmada! Recibirás un WhatsApp con los detalles.");
                      navigate('/');
                    }}
                    onCancel={() => navigate(`/trip/${selectedTrip.id}`)}
                  />
                ) : <HomeScreen onSearch={handleSearch} isLoaded={isLoaded} />
              } />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <BookingProvider>
        <AppContent />
      </BookingProvider>
    </Router>
  );
}
