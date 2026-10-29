import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseConfig';
import { useAuth } from '../../lib/AuthContext';
import { 
  Calendar, Plus, X, Edit2, Trash2, Save, Upload, Loader2, 
  Ticket, Clock, MapPin, Coins, QrCode, Key, Image as ImageIcon, Repeat, Zap
} from 'lucide-react';
import { toast } from 'sonner';
const formatarDataBR = (dateStr) => {
  if (!dateStr) return '';
  const [ano, mes, dia] = String(dateStr).split('-');
  if (!ano || !mes || !dia) return dateStr;
  return `${dia}/${mes}/${ano}`;
};
export default function AdminEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [myMerchants, setMyMerchants] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const isAdmin = user?.user_metadata?.user_type === 'admin';

  const [editingEvent, setEditingEvent] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [formData, setFormData] = useState({
    title: '', category: 'show', description: '', location: '',
    date: '', time: '', is_free: true, price: 0, 
    ticket_url: '', image_url: '', merchant_id: '',
    pix_key: '', payment_key: '',
    reward_xp: 50, reward_itacoins: 0,
    is_recurring: false, recurrence_end_date: '' 
  });

  useEffect(() => {
    if (user) {
      fetchEventsAndShops();
    }
  }, [user]);

  const fetchEventsAndShops = async () => {
    setLoading(true);
    try {
      let shopsQuery = supabase.from('merchants').select('id, name');
      if (!isAdmin) shopsQuery = shopsQuery.eq('owner_id', user.id);
      const { data: shops } = await shopsQuery;
      if (shops) setMyMerchants(shops);

      let eventsQuery = supabase.from('events').select('*').order('date', { ascending: true });
      if (!isAdmin && shops) {
        const shopIds = shops.map(s => s.id).filter(Boolean);
        if (shopIds.length > 0) {
          eventsQuery = eventsQuery.in('merchant_id', shopIds);
        } else {
          setEvents([]);
          setLoading(false);
          return;
        }
      }
      const { data: eventsData } = await eventsQuery;
      if (eventsData) setEvents(eventsData);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar dados do painel.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (eventItem) => {
    setEditingEvent(eventItem);
    setIsCreatingNew(false);
    setFormData({
      title: eventItem.title || '',
      category: eventItem.category || 'show',
      description: eventItem.description || '',
      location: eventItem.location || '',
      date: eventItem.date || '',
      time: eventItem.time || '',
      is_free: eventItem.is_free ?? true,
      price: eventItem.price || 0,
      ticket_url: eventItem.ticket_url || '',
      image_url: eventItem.image_url || '',
      merchant_id: eventItem.merchant_id || '',
      pix_key: eventItem.pix_key || '',         
      payment_key: eventItem.payment_key || '',
      reward_xp: eventItem.reward_xp || 50,
      reward_itacoins: eventItem.reward_itacoins || 0,
      is_recurring: false, recurrence_end_date: ''
    });
  };

  const handleCreateClick = () => {
    setIsCreatingNew(true);
    setEditingEvent(null);
    setFormData({
      title: '', category: 'show', description: '', location: '',
      date: '', time: '', is_free: true, price: 0, 
      ticket_url: '', image_url: '', 
      merchant_id: myMerchants.length === 1 ? myMerchants[0].id : '', 
      pix_key: '', payment_key: '',
      reward_xp: 50, reward_itacoins: 0,
      is_recurring: false, recurrence_end_date: ''
    });
  };

  const generateRecurringEvents = (basePayload, startDateStr, endDateStr) => {
    const eventsToInsert = [];
    const [y, m, d] = startDateStr.split('-');
    let currentDate = new Date(y, m - 1, d);
    
    const [ey, em, ed] = endDateStr.split('-');
    const endDate = new Date(ey, em - 1, ed);

    while (currentDate <= endDate) {
      const formattedDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      eventsToInsert.push({ ...basePayload, date: formattedDate });
      currentDate.setDate(currentDate.getDate() + 7);
    }
    return eventsToInsert;
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    setUploadingMedia(true);

    const { is_recurring, recurrence_end_date, ...restFormData } = formData;
    
    const basePayload = { 
      ...restFormData, 
      price: formData.is_free ? 0 : parseFloat(formData.price) || 0,
      reward_xp: parseInt(formData.reward_xp) || 0,
      reward_itacoins: parseInt(formData.reward_itacoins) || 0,
      merchant_id: formData.merchant_id === "" ? null : formData.merchant_id 
    };

    try {
      if (isCreatingNew) {
        if (formData.is_recurring && formData.recurrence_end_date) {
          const eventsToInsert = generateRecurringEvents(basePayload, formData.date, formData.recurrence_end_date);
          
          if (eventsToInsert.length === 0) {
            toast.error('A data final deve ser igual ou posterior à data inicial.');
            setUploadingMedia(false);
            return;
          }

          const { error } = await supabase.from('events').insert(eventsToInsert);
          if (error) throw error;
          toast.success(`${eventsToInsert.length} eventos agendados com sucesso!`);
          
        } else {
          const { error } = await supabase.from('events').insert([basePayload]);
          if (error) throw error;
          toast.success('Evento agendado com sucesso!');
        }

      } else if (editingEvent) {
        const { error } = await supabase.from('events').update(basePayload).eq('id', editingEvent.id);
        if (error) throw error;
        toast.success('Evento atualizado!');
      }

      setIsCreatingNew(false);
      setEditingEvent(null);
      fetchEventsAndShops();
    } catch (err) {
      toast.error('Erro ao salvar evento. Verifique os campos.');
      console.error(err);
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Excluir permanentemente este evento da agenda?')) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) {
      toast.success('Evento cancelado e removido.');
      fetchEventsAndShops();
    }
  };

  const handleUploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `events/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('images').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, image_url: data.publicUrl }));
      toast.success('Capa do evento carregada!');
    } catch (err) {
      toast.error('Erro ao subir imagem.');
    }
    setUploadingMedia(false);
  };

  return (
    <div className="space-y-6 text-white font-sans text-left">
      <div className="flex items-center justify-between border-b border-blue-900/40 pb-4">
        <div>
          <h2 className="text-base font-black">Agenda de Eventos Locais</h2>
          <p className="text-xs text-blue-400">Promova shows, feiras, workshops e controle a bilheteria no próprio app.</p>
        </div>
        {!editingEvent && !isCreatingNew && (
          <button onClick={handleCreateClick} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg active:scale-95 transition-all">
            <Plus className="w-4 h-4" /> Novo Evento
          </button>
        )}
        {(editingEvent || isCreatingNew) && (
          <button onClick={() => { setEditingEvent(null); setIsCreatingNew(false); }} className="bg-blue-950 border border-blue-900/60 text-blue-300 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all">
            <X className="w-4 h-4" /> Voltar à Lista
          </button>
        )}
      </div>

      {(editingEvent || isCreatingNew) ? (
        <form onSubmit={handleSaveEvent} className="bg-[#0A1428] p-6 rounded-3xl border border-blue-900/50 shadow-xl space-y-4 max-w-2xl">
          <h3 className="text-sm font-black text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4"/> Dados do Evento
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Título do Evento</label>
              <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-[#050B14] border border-blue-900/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50" placeholder="Ex: Luau de Itacaré" />
            </div>
            <div>
              <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Categoria</label>
              <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-[#050B14] border border-blue-900/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50">
                <option value="show">Show / Concerto</option>
                <option value="festival">Festival</option>
                <option value="feira">Feira / Exposição</option>
                <option value="cultural">Evento Cultural</option>
                <option value="esportivo">Esportivo</option>
                <option value="gastronomico">Gastronômico</option>
                <option value="workshop">Workshop / Palestra</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Data {isCreatingNew ? 'Inicial' : ''}</label>
              <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-[#050B14] border border-blue-900/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50" />
            </div>
            <div>
              <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Horário de Início</label>
              <input type="text" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-[#050B14] border border-blue-900/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50" placeholder="Ex: 21:00" />
            </div>
            <div>
              <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Vincular Estabelecimento</label>
              <select required value={formData.merchant_id} onChange={e => setFormData({...formData, merchant_id: e.target.value})} className="w-full bg-[#050B14] border border-blue-900/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50">
                <option value="">Selecione o local...</option>
                {myMerchants.map(shop => (
                  <option key={shop.id} value={shop.id}>{shop.name}</option>
                ))}
              </select>
            </div>

            {isCreatingNew && (
              <div className="md:col-span-3 bg-purple-950/20 p-4 rounded-xl border border-purple-500/20 flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer w-max">
                  <input 
                    type="checkbox" 
                    checked={formData.is_recurring} 
                    onChange={e => setFormData({...formData, is_recurring: e.target.checked})} 
                    className="w-4 h-4 accent-purple-500 rounded cursor-pointer" 
                  />
                  <span className="text-[11px] font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5" /> Evento Recorrente (Semanal)
                  </span>
                </label>
                
                {formData.is_recurring && (
                  <div>
                    <label className="text-[10px] font-bold text-purple-200 block mb-1">Repetir automaticamente todas as semanas até o dia:</label>
                    <input 
                      type="date" 
                      min={formData.date}
                      required={formData.is_recurring}
                      value={formData.recurrence_end_date} 
                      onChange={e => setFormData({...formData, recurrence_end_date: e.target.value})} 
                      className="w-full md:w-1/3 bg-[#050B14] border border-purple-900/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50 text-white" 
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Localização Descritiva</label>
            <input required type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full bg-[#050B14] border border-blue-900/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50" placeholder="Ex: Praia da Concha" />
          </div>

          <div>
            <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Descrição / Atrações do Evento</label>
            <textarea rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-[#050B14] border border-blue-900/50 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-purple-400/50" placeholder="Detalhes do evento..."></textarea>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#050B14] p-4 rounded-xl border border-blue-900/40">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-black">Entrada Gratuita?</span>
                <span className="text-[10px] text-blue-400">Sem cobrança de ingresso via App</span>
              </div>
              <input type="checkbox" checked={formData.is_free} onChange={e => setFormData({...formData, is_free: e.target.checked})} className="w-5 h-5 accent-purple-500 rounded cursor-pointer" />
            </div>
            {!formData.is_free && (
              <div>
                <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Valor da Entrada (R$)</label>
                <input required type="number" step="0.01" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full bg-[#0A1428] border border-blue-900/50 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-400/50" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-950/20 p-4 rounded-xl border border-emerald-500/20">
            <div className="col-span-full">
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4" /> Recompensas para o Cliente
              </h4>
              <p className="text-[10px] text-emerald-200/70 mb-2">Defina o que o cliente ganha ao validar o ingresso ou fazer check-in no local.</p>
            </div>
            <div>
              <label className="text-[10px] font-black text-emerald-400 uppercase flex items-center gap-1 mb-1">
                XP (Experiência)
              </label>
              <input type="number" min="0" value={formData.reward_xp} onChange={e => setFormData({...formData, reward_xp: e.target.value})} className="w-full bg-[#0A1428] border border-emerald-900/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400/50" placeholder="Ex: 50" />
            </div>
            <div>
              <label className="text-[10px] font-black text-amber-400 uppercase flex items-center gap-1 mb-1">
                <Coins className="w-3.5 h-3.5" /> iTaCoins (Cashback)
              </label>
              <input type="number" min="0" value={formData.reward_itacoins} onChange={e => setFormData({...formData, reward_itacoins: e.target.value})} className="w-full bg-[#0A1428] border border-amber-900/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400/50" placeholder="Ex: 10" />
            </div>
          </div>

          {!formData.is_free && (
            <div className="p-4 bg-[#050B14] rounded-2xl border-2 border-purple-500/20 space-y-4 shadow-inner">
              <h4 className="text-xs font-black text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Venda de Ingressos pelo App
              </h4>
              <p className="text-[10px] text-blue-400 mb-2 leading-relaxed">
                O aplicativo fará a emissão digital do ingresso. Adicione sua chave PIX para que o pagamento caia diretamente na conta do estabelecimento.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-amber-400 uppercase flex items-center gap-1 mb-1">
                    <Coins className="w-3.5 h-3.5" /> Chave PIX Receptora
                  </label>
                  <input type="text" value={formData.pix_key} onChange={e => setFormData({...formData, pix_key: e.target.value})} className="w-full bg-[#0A1428] border border-blue-900/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400/50" placeholder="Ex: CNPJ, Email ou Celular" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-cyan-400 uppercase flex items-center gap-1 mb-1">
                    <Key className="w-3.5 h-3.5" /> Link Checkout (Opcional)
                  </label>
                  <input type="text" value={formData.payment_key} onChange={e => setFormData({...formData, payment_key: e.target.value})} className="w-full bg-[#0A1428] border border-blue-900/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400/50" placeholder="Kiwify, Sympla, etc" />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Site ou Instagram Oficial (Opcional)</label>
            <input type="url" value={formData.ticket_url} onChange={e => setFormData({...formData, ticket_url: e.target.value})} className="w-full bg-[#0A1428] border border-blue-900/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-400/50" placeholder="https://..." />
          </div>

          <div>
            <label className="text-[10px] font-black text-blue-300 uppercase block mb-1">Imagem em Destaque (Capa do Evento)</label>
            <div className="flex items-center gap-4 bg-[#050B14] p-3 rounded-xl border border-blue-900/40">
              <div className="w-16 h-12 rounded-xl bg-blue-950 border border-blue-900 overflow-hidden shrink-0 flex items-center justify-center">
                {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="w-5 h-5 text-blue-500" />}
              </div>
              <label className="bg-blue-900/40 hover:bg-blue-900/70 text-purple-400 text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors">
                {uploadingMedia ? "Carregando..." : "Escolher Arquivo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={uploadingMedia} />
              </label>
            </div>
          </div>

          <button type="submit" disabled={uploadingMedia} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all mt-4">
            {uploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4" /> {isCreatingNew ? "Agendar Evento no App" : "Salvar Alterações"}</>}
          </button>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full text-center py-10 text-sm text-blue-400">Buscando agenda de eventos...</div>
          ) : events.length === 0 ? (
            <div className="col-span-full text-center py-10 text-sm text-blue-500">Nenhum evento agendado.</div>
          ) : (
            events.map(ev => (
              <div key={ev.id} className="bg-[#0A1428] border border-blue-900/40 rounded-3xl overflow-hidden shadow-md flex flex-col group hover:border-purple-500/40 transition-all">
                {ev.image_url && <img src={ev.image_url} alt="" className="w-full h-24 object-cover opacity-80" />}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h4 className="text-sm font-black text-white truncate leading-tight">{ev.title}</h4>
                      <span className="text-[8px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full uppercase tracking-wider">{ev.category}</span>
                    </div>
                    <div className="space-y-0.5 text-[10px] text-blue-400">
<p className="flex items-center gap-1"><Clock className="w-3 h-3 text-purple-400" /> {formatarDataBR(ev.date)} às {ev.time || 'A definir'}</p>                      <p className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 text-purple-400" /> {ev.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-blue-900/30">
                    <span className="text-xs font-black text-white">{ev.is_free ? 'Ingresso Gratuito' : `App Ticket: R$ ${ev.price}`}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEditClick(ev)} className="p-2 bg-blue-950 hover:bg-blue-900 border border-blue-800/60 text-purple-400 rounded-xl transition-all">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteEvent(ev.id)} className="p-2 bg-blue-950 hover:bg-rose-950 border border-blue-800/60 text-rose-400 rounded-xl transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
