/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Settings, Calculator, Plus, Trash2, Save, ShoppingCart, Ruler, Hammer, LogIn, LogOut, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Material, QuoteProject, QuoteType, BarOrientation, CalculationResult, MaterialType } from './types';
import { DEFAULT_MATERIALS } from './constants';
import { cn, calculateQuote } from './lib/utils';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { collection, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, doc, setDoc, getDocFromServer } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './services/errorHandlers';

export default function App() {
  const [activeTab, setActiveTab] = useState<'quote' | 'materials' | 'history'>('quote');
  const [user, setUser] = useState<User | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [quotes, setQuotes] = useState<QuoteProject[]>([]);
  const [quoteItems, setQuoteItems] = useState<{ id: string; project: QuoteProject; calculation: CalculationResult }[]>([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [project, setProject] = useState<QuoteProject>({
    id: Math.random().toString(36).substr(2, 9),
    type: QuoteType.WINDOW,
    name: 'Abertura 1',
    width: 1000,
    height: 1000,
    orientation: BarOrientation.VERTICAL,
    barMaterialId: '',
    frameMaterialId: '',
    hasFrame: true,
    barSpacing: 120,
    globalDiscount: 0,
    frameRotated: false,
    hasLock: false,
    installationType: 'recessed',
    createdAt: Date.now(),
  });

  // Auth & Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Listen for Materials
  useEffect(() => {
    if (!user) {
      setMaterials(DEFAULT_MATERIALS);
      return;
    }

    const q = query(collection(db, 'materials'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Material));
      if (data.length === 0) {
        // If first time, seed default materials
        DEFAULT_MATERIALS.forEach(m => {
          setDoc(doc(db, 'materials', m.id), m).catch(e => handleFirestoreError(e, OperationType.WRITE, 'materials'));
        });
      } else {
        setMaterials(data);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'materials'));

    return () => unsubscribe();
  }, [user]);

  // Listen for Quotes
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'quotes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setQuotes(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as QuoteProject)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'quotes'));

    return () => unsubscribe();
  }, [user]);

  const calculation = useMemo(() => calculateQuote(project, materials), [project, materials]);
  
  const totalQuoteCost = useMemo(() => {
    return quoteItems.reduce((acc, item) => acc + item.calculation.totalCost, 0) + calculation.totalCost;
  }, [quoteItems, calculation]);

  const handleAddItemToQuote = () => {
    setQuoteItems([...quoteItems, { id: Math.random().toString(36).substr(2, 9), project: { ...project, id: Math.random().toString(36).substr(2, 9) }, calculation }]);
    setProject({
      ...project,
      id: Math.random().toString(36).substr(2, 9),
      name: `Abertura ${quoteItems.length + 2}`,
      globalDiscount: 0,
      frameRotated: false,
      createdAt: Date.now(),
    });
  };

  const handleRemoveItemFromQuote = (id: string) => {
    setQuoteItems(quoteItems.filter(item => item.id !== id));
  };

  useEffect(() => {
    if (materials.length > 0 && !project.barMaterialId) {
      setProject(prev => ({
        ...prev,
        barMaterialId: materials.find(m => m.type.includes('iron'))?.id || materials[0].id,
        frameMaterialId: materials.find(m => m.type === MaterialType.FLAT_BAR)?.id || materials[0].id,
        leafFrameMaterialId: materials.find(m => m.type === MaterialType.LEAF_PROFILE)?.id || ''
      }));
    }
  }, [materials]);

  const handleLogin = () => signInWithPopup(auth, new GoogleAuthProvider());
  const handleLogout = () => signOut(auth);

  const handleUpdateMaterial = async (id: string, updates: Partial<Material>) => {
    if (!user) {
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
      return;
    }
    try {
      await updateDoc(doc(db, 'materials', id), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `materials/${id}`);
    }
  };

  const handleAddMaterial = async () => {
    const newMaterial: Partial<Material> = {
      name: 'Nuevo Material',
      type: MaterialType.IRON_ROUND,
      unit: 'm',
      pricePerUnit: 0,
    };
    if (!user) {
      setMaterials([...materials, { ...newMaterial, id: Math.random().toString() } as Material]);
      return;
    }
    try {
      await addDoc(collection(db, 'materials'), newMaterial);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'materials');
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!user) {
      setMaterials(materials.filter(m => m.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'materials', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `materials/${id}`);
    }
  };

  const handleSaveQuote = async () => {
    if (!user) return alert("Por favor inicia sesión para guardar cotizaciones.");
    try {
      const data = { ...project, userId: user.uid, totalCost: calculation.totalCost };
      await addDoc(collection(db, 'quotes'), data);
      alert("Cotización guardada con éxito.");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'quotes');
    }
  };

  const loadQuote = (q: QuoteProject) => {
    setProject(q);
    setActiveTab('quote');
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold tracking-tight text-blue-400">IRON<span className="text-white">MASTER</span></h1>
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Herrería Profesional</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('quote')}
            className={cn(
              "w-full flex items-center space-x-3 p-3 rounded-lg text-sm font-medium transition-all",
              activeTab === 'quote' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Calculator className="w-5 h-5" />
            <span>Nueva Cotización</span>
          </button>
          
          <button
            onClick={() => setActiveTab('materials')}
            className={cn(
              "w-full flex items-center space-x-3 p-3 rounded-lg text-sm font-medium transition-all text-left",
              activeTab === 'materials' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Settings className="w-5 h-5" />
            <span>Precios Materiales</span>
          </button>

          {user && (
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "w-full flex items-center space-x-3 p-3 rounded-lg text-sm font-medium transition-all text-left",
                activeTab === 'history' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <FileText className="w-5 h-5" />
              <span>Historial de Pedidos</span>
            </button>
          )}
        </nav>

        <div className="p-4 bg-slate-800/50 border-t border-slate-700">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-slate-600" />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate opacity-90">{user.displayName}</p>
                  <p className="text-[10px] text-slate-400 truncate uppercase tracking-tighter">Pro User</p>
                </div>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-white hover:text-slate-900 py-2 rounded-lg text-xs font-bold transition-all"
            >
              <LogIn className="w-4 h-4" />
              ACCEDER
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              {activeTab === 'quote' ? `Proyecto: ${project.name || 'Sin título'}` : 
               activeTab === 'materials' ? 'Gestión de Inventario' : 'Historial de Trabajos'}
            </h2>
            {activeTab === 'quote' && (
              <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded uppercase">Draft #{project.id.slice(-4)}</span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {activeTab === 'quote' && (
              <button 
                onClick={handleAddItemToQuote}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 transition-all shadow-sm flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                AGREGAR OTRA ABERTURA
              </button>
            )}
            {activeTab === 'quote' && (
              <button 
                onClick={handleSaveQuote}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5 text-blue-400" />
                GUARDAR Y FINALIZAR
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {!user && activeTab !== 'quote' && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-100 text-blue-800 rounded-xl flex items-center gap-3">
              <Settings className="w-5 h-5 text-blue-500" />
              <p className="text-xs font-medium uppercase tracking-tight">Modo Invitado: Los cambios en materiales no se guardarán permanentemente.</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'quote' && (
              <motion.div
                key="quote"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-12 gap-6 h-full"
              >
                {/* Left Column: Configurator */}
                <div className="col-span-7 space-y-6">
                  {/* Type Selection */}
                  <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">1. Tipo de Trabajo</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setProject({ ...project, type: QuoteType.WINDOW })}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all",
                          project.type === QuoteType.WINDOW ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm scale-[1.02]" : "border-slate-100 bg-white text-slate-500 hover:border-blue-200"
                        )}
                      >
                        <span className="text-sm font-black uppercase">Ventana de Reja</span>
                      </button>
                      <button
                        onClick={() => setProject({ ...project, type: QuoteType.DOOR })}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all",
                          project.type === QuoteType.DOOR ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm scale-[1.02]" : "border-slate-100 bg-white text-slate-500 hover:border-blue-200"
                        )}
                      >
                        <span className="text-sm font-black uppercase">Puerta de Hierro</span>
                      </button>
                    </div>
                  </section>

                  {/* Dimensions Section */}
                  <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">2. Medidas del Vano</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre del Trabajo</label>
                        <input
                          type="text"
                          value={project.name}
                          onChange={e => setProject({ ...project, name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ancho Vano (mm)</label>
                          <input
                            type="number"
                            value={project.width}
                            onChange={e => setProject({ ...project, width: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alto Vano (mm)</label>
                          <input
                            type="number"
                            value={project.height}
                            onChange={e => setProject({ ...project, height: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Holgura Final (mm)</label>
                        <input
                          type="number"
                          value={project.globalDiscount}
                          onChange={e => setProject({ ...project, globalDiscount: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                          placeholder="Ej: 10"
                        />
                        <p className="text-[9px] text-slate-400 mt-1 font-medium">Disminuye la medida final de la reja respecto al vano.</p>
                      </div>
                    </div>
                  </section>

                  {/* Material Config */}
                  <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">3. Configuración de Herrería</h3>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fijación</label>
                          <div className="grid grid-cols-2 border border-slate-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setProject({ ...project, installationType: 'recessed' })}
                              className={cn("py-2 text-[10px] font-black uppercase transition-all", project.installationType === 'recessed' ? "bg-slate-900 text-white" : "bg-white text-slate-400 hover:bg-slate-50")}
                            >
                              Empotrable
                            </button>
                            <button
                              onClick={() => setProject({ ...project, installationType: 'screwed' })}
                              className={cn("py-2 text-[10px] font-black uppercase transition-all border-l border-slate-200", project.installationType === 'screwed' ? "bg-slate-900 text-white" : "bg-white text-slate-400 hover:bg-slate-50")}
                            >
                              Atornillar
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Orientación</label>
                          <div className="grid grid-cols-2 border border-slate-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setProject({ ...project, orientation: BarOrientation.VERTICAL })}
                              className={cn("py-2 text-[10px] font-black uppercase transition-all", project.orientation === BarOrientation.VERTICAL ? "bg-slate-900 text-white" : "bg-white text-slate-400 hover:bg-slate-50")}
                            >
                              Vertical
                            </button>
                            <button
                              onClick={() => setProject({ ...project, orientation: BarOrientation.HORIZONTAL })}
                              className={cn("py-2 text-[10px] font-black uppercase transition-all border-l border-slate-200", project.orientation === BarOrientation.HORIZONTAL ? "bg-slate-900 text-white" : "bg-white text-slate-400 hover:bg-slate-50")}
                            >
                              Horizontal
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cura con Marco</label>
                          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <input
                              type="checkbox"
                              id="hasFrame"
                              checked={project.hasFrame}
                              onChange={e => setProject({ ...project, hasFrame: e.target.checked })}
                              className="w-4 h-4 accent-blue-600 cursor-pointer"
                            />
                            <label htmlFor="hasFrame" className="text-xs font-bold text-slate-700 cursor-pointer">Lleva Marco Perimetral</label>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Material Barrotes</label>
                          <select
                            value={project.barMaterialId}
                            onChange={e => setProject({ ...project, barMaterialId: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs font-bold text-slate-700"
                          >
                            {materials.filter(m => m.type.includes('iron')).map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Separación entre Barrotes (mm)</label>
                          <input
                            type="number"
                            value={project.barSpacing}
                            onChange={e => setProject({ ...project, barSpacing: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm font-bold font-mono"
                          />
                        </div>
                        {project.hasFrame && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Perfil del Marco</label>
                              <select
                                value={project.frameMaterialId}
                                onChange={e => setProject({ ...project, frameMaterialId: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs font-bold text-slate-700"
                              >
                                {materials.filter(m => m.type === MaterialType.FRAME_PROFILE || m.type === MaterialType.FLAT_BAR || m.type === MaterialType.LEAF_PROFILE).map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                            
                            {/* Rotation Toggle if profile is rectangular */}
                            {materials.find(m => m.id === project.frameMaterialId)?.name.match(/\d+\s*[xX]\s*\d+/) && 
                             materials.find(m => m.id === project.frameMaterialId && !m.name.includes("-") && m.type !== MaterialType.FLAT_BAR) && (
                              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <input
                                  type="checkbox"
                                  id="frameRotated"
                                  checked={project.frameRotated}
                                  onChange={e => setProject({ ...project, frameRotated: e.target.checked })}
                                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                                />
                                <label htmlFor="frameRotated" className="text-[10px] font-black text-slate-700 uppercase cursor-pointer">Girar Caño (Cara angosta al vano)</label>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {project.type === QuoteType.DOOR && (
                      <div className="mt-8 pt-6 border-t border-slate-100 space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Perfil Hoja (Bastidor)</label>
                              <select
                                value={project.leafFrameMaterialId}
                                onChange={e => setProject({ ...project, leafFrameMaterialId: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs font-bold text-slate-700"
                              >
                                <option value="">Seleccionar Perfil...</option>
                                {materials.filter(m => m.type === MaterialType.LEAF_PROFILE || m.type === MaterialType.FRAME_PROFILE).map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                <input
                                  type="checkbox"
                                  id="isDoubleLeaf"
                                  checked={project.isDoubleLeaf}
                                  onChange={e => setProject({ ...project, isDoubleLeaf: e.target.checked })}
                                  className="w-4 h-4 accent-blue-600"
                                />
                                <label htmlFor="isDoubleLeaf" className="text-[10px] font-black text-slate-700 uppercase">Doble Hoja</label>
                              </div>
                              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                <input
                                  type="checkbox"
                                  id="hasLock"
                                  checked={project.hasLock}
                                  onChange={e => setProject({ ...project, hasLock: e.target.checked })}
                                  className="w-4 h-4 accent-blue-600"
                                />
                                <label htmlFor="hasLock" className="text-[10px] font-black text-slate-700 uppercase">Cerradura</label>
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cant. Bisagras</label>
                            <input
                              type="number"
                              value={project.hingeCount || 3}
                              onChange={e => setProject({ ...project, hingeCount: Number(e.target.value) })}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs font-bold font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                {/* Right Column: Results Summary */}
                <div className="col-span-5 flex flex-col space-y-6">
                  {/* Itemized List (Cart) */}
                  {quoteItems.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                          <ShoppingCart className="w-3 h-3 text-blue-500" />
                          Items en Cotización
                        </h3>
                      </div>
                      <div className="p-2 space-y-1">
                        {quoteItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-black text-slate-800 uppercase truncate">{item.project.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                                {item.project.type === QuoteType.WINDOW ? 'Ventana' : 'Puerta'} · {item.project.width}x{item.project.height}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black text-blue-600">${Math.round(item.calculation.totalCost).toLocaleString()}</span>
                              <button 
                                onClick={() => handleRemoveItemFromQuote(item.id)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cutting List Card */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <Ruler className="w-3 h-3 text-blue-500" />
                        Cortes Reja Actual
                      </h3>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Previsualización</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] text-slate-400 uppercase text-left border-b border-slate-100">
                            <th className="pb-2 font-black">Pieza</th>
                            <th className="pb-2 font-black text-center">Cant</th>
                            <th className="pb-2 font-black text-right">Largo (mm)</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-600 divide-y divide-slate-100">
                          {calculation.cutList.map((cut, idx) => {
                            const hasAdjustment = cut.originalLength && cut.originalLength !== cut.length;
                            return (
                              <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                                <td className="py-2.5 flex items-center gap-2">
                                  {cut.color && <div className={cn("w-2 h-2 rounded-full flex-shrink-0", cut.color.replace('text-', 'bg-'))} />}
                                  <span className="font-bold text-slate-800">{cut.item}</span>
                                </td>
                                <td className="py-2.5 text-center font-black text-blue-600">{cut.count}</td>
                                <td className="py-2.5 text-right font-mono font-bold whitespace-nowrap">
                                  {hasAdjustment && (
                                    <>
                                      <span className="text-[10px] text-slate-300 font-bold line-through mr-2">
                                        {cut.originalLength}
                                      </span>
                                      <span className={cn("text-[10px] mr-2", cut.color || 'text-slate-400')}>
                                        -{Math.round((cut.originalLength || 0) - cut.length)}
                                      </span>
                                    </>
                                  )}
                                  <span className={cn(cut.color || 'text-slate-800')}>
                                    {cut.length}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      
                      {calculation.clearances.length > 0 && (
                        <div className="mt-8 p-5 bg-slate-50 rounded-2xl border border-slate-200/50">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                              <Settings className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-tight">
                              Glosario de Ajustes
                            </h4>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-3">
                            {calculation.clearances.map((c, idx) => (
                              <div key={idx} className="flex justify-between items-center group">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-3 h-3 rounded-full flex-shrink-0 shadow-sm transition-transform group-hover:scale-110", 
                                    c.color?.replace('text-', 'bg-') || 'bg-slate-300'
                                  )} />
                                  <span className={cn("text-[11px] font-bold uppercase tracking-tight", c.color || 'text-slate-500')}>
                                    {c.description}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black text-slate-300 font-mono">DESC</span>
                                  <span className={cn("text-xs font-black font-mono px-2 py-0.5 rounded bg-white border border-slate-100 shadow-sm", c.color || 'text-slate-400')}>
                                    -{c.value}mm
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-slate-200/50">
                            <p className="text-[10px] text-slate-400 font-medium italic">
                              * Las medidas en la lista de corte superiores identificadas con estos colores ya incluyen los descuentos indicados.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing Card */}
                  <div className="bg-slate-900 text-white rounded-xl p-6 shadow-xl border border-slate-800">
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                        <span>Abertura Actual</span>
                        <span className="text-white">$ {Math.round(calculation.totalCost).toLocaleString()}</span>
                      </div>
                      {quoteItems.length > 0 && (
                        <div className="flex justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                          <span>Subtotal Items ({quoteItems.length})</span>
                          <span className="text-white">$ {Math.round(quoteItems.reduce((acc, i) => acc + i.calculation.totalCost, 0)).toLocaleString()}</span>
                        </div>
                      )}
                      
                      <div className="pt-5 mt-4 border-t border-slate-800 flex justify-between items-baseline">
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Final</span>
                        <div className="text-right">
                          <span className="text-3xl font-black text-blue-400 tracking-tighter">
                            $ {Math.round(totalQuoteCost).toLocaleString()}
                          </span>
                          <p className="text-[10px] text-slate-500 font-black mt-1">MATERIALES NETOS</p>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleSaveQuote}
                      className="w-full mt-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/40 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      FINALIZAR PRESUPUESTO
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          {activeTab === 'materials' && (
            <motion.div
              key="materials"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-8">
                <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Catálogo de Materiales</h2>
                    <p className="text-slate-500 text-sm font-medium">Gestiona tu lista de precios e insumos para cotizar con precisión.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Buscar material..."
                        value={materialSearch}
                        onChange={(e) => setMaterialSearch(e.target.value)}
                        className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 w-64"
                      />
                      <Settings className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    </div>
                    <button 
                      onClick={handleAddMaterial}
                      className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-900/20 hover:bg-blue-700 transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      NUEVO MATERIAL
                    </button>
                  </div>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left bg-white">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoría</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Precio / Unidad</th>
                        <th className="px-6 py-4 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {materials
                        .filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase()) || m.type.toLowerCase().includes(materialSearch.toLowerCase()))
                        .map(material => (
                        <tr key={material.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              value={material.name}
                              onChange={e => handleUpdateMaterial(material.id, { name: e.target.value })}
                              className="bg-transparent border-none focus:ring-0 w-full text-sm font-bold text-slate-800 outline-none"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={material.type}
                              onChange={e => handleUpdateMaterial(material.id, { type: e.target.value as MaterialType })}
                              className="bg-slate-100 border-none rounded px-2 py-1 text-[10px] font-black text-slate-500 uppercase outline-none"
                            >
                              {Object.values(MaterialType).map(t => (
                                <option key={t} value={t}>{t.replace('_', ' ')}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-bold">$</span>
                              <input
                                type="number"
                                value={material.pricePerUnit}
                                onChange={e => handleUpdateMaterial(material.id, { pricePerUnit: Number(e.target.value) })}
                                className="bg-transparent border-none focus:ring-0 w-24 text-sm font-black text-slate-900 outline-none"
                              />
                              <span className="text-[10px] font-black text-slate-300 uppercase">/ {material.unit}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleDeleteMaterial(material.id)}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Historial de Trabajos</h2>
                  <p className="text-slate-500 text-sm font-medium mt-1">Recupera cálculos guardados anteriormente.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {quotes.length > 0 ? (
                  quotes.map(q => (
                    <div key={q.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-12 -mt-12 group-hover:bg-blue-100 transition-colors" />
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                          <div className="p-3 bg-slate-900 text-blue-400 rounded-xl">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase">{new Date(q.createdAt).toLocaleDateString()}</p>
                            <p className="text-xl font-black text-blue-600 tracking-tighter">${(q as any).totalCost?.toLocaleString()}</p>
                          </div>
                        </div>
                        <h4 className="text-md font-black text-slate-800 mb-2 truncate uppercase tracking-tight">{q.name}</h4>
                        <div className="flex gap-2 text-[10px] font-black uppercase mb-6">
                          <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded">{q.type === QuoteType.WINDOW ? 'Ventana' : 'Puerta'}</span>
                          <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded">{q.width}x{q.height}mm</span>
                        </div>
                        <button 
                          onClick={() => loadQuote(q)}
                          className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95"
                        >
                          Cargar Cotización
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-20 bg-white rounded-3xl border border-dashed border-slate-300 text-center">
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sin registros históricos</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  </div>
);
}
