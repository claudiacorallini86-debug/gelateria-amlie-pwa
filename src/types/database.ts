export interface Ingrediente {
  id: string;
  userId: string;
  nome: string;
  categoria?: string;
  fornitorePredefinito?: string;
  allergeni?: string;
  unitaMisura: string;
  note?: string;
  conservazione?: string;
  scortaMinima?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LottoIngrediente {
  id: string;
  userId: string;
  ingredienteId: string;
  codiceLotto: string;
  fornitore?: string;
  dataConsegna?: string;
  dataScadenza?: string;
  quantitaIniziale: number;
  quantitaAttuale: number;
  unitaMisura: string;
  conservazione?: string;
  note?: string;
  fotoEtichettaUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MovimentoMagazzino {
  id: string;
  userId: string;
  ingredienteId: string;
  lottoId?: string;
  tipo: 'carico' | 'scarico';
  quantita: number;
  unitaMisura: string;
  causale?: string;
  dataMovimento: string;
  createdAt: string;
}

export interface PrezzoStorico {
  id: string;
  userId: string;
  ingredienteId: string;
  dataAcquisto: string;
  fornitore?: string;
  prezzoPerUnita: number;
  riferimentoDocumento?: string;
  fotoDocumentoUrl?: string;
  note?: string;
  createdAt: string;
}

export interface Prodotto {
  id: string;
  userId: string;
  nome: string;
  tipo?: string;
  unitaVendita: string;
  prezzoVendita?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ricette {
  id: string;
  userId: string;
  prodottoId: string;
  resaBatch: number;
  unitaResa: string;
  overheadPercent?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RicettaIngrediente {
  id: string;
  userId: string;
  ricettaId: string;
  ingredienteId: string;
  quantita: number;
  unitaMisura: string;
}

export interface LottoProduzione {
  id: string;
  userId: string;
  prodottoId: string;
  ricettaId: string;
  dataProduzione: string;
  quantitaProdotta: number;
  unitaResa: string;
  costoTotaleBatch?: number;
  costoUnitario?: number;
  note?: string;
  createdAt: string;
  generatoDaTemplateId?: string;
  generatoIl?: string;
}

export interface LottoProduzioneDettagli {
  id: string;
  userId: string;
  lottoProduzioneId: string;
  ingredienteId: string;
  lottoIngredienteId?: string;
  quantitaUsata: number;
  unitaMisura: string;
  prezzoCongelato: number;
  costoRiga: number;
}

export interface HaccpTemperature {
  id: string;
  userId: string;
  attrezzatura: string;
  temperatura: number;
  limiteMax?: number;
  limiteMin?: number;
  dataOra: string;
  operatore?: string;
  note?: string;
  nonConformita?: string;
  azioneCorrettiva?: string;
  createdAt: string;
  turno?: string;
  stato?: string;
  motivoAnnullamento?: string;
  dataRiferimento?: string;
}

export interface HaccpPulizie {
  id: string;
  userId: string;
  area: string;
  compito: string;
  frequenza?: string;
  eseguito: boolean;
  dataOra: string;
  operatore?: string;
  note?: string;
  createdAt: string;
  turno?: string;
  stato?: string;
  motivoAnnullamento?: string;
  dataRiferimento?: string;
  ora?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  azione: string;
  tabella: string;
  recordId: string;
  dettagli?: string;
  dataOra: string;
}

export interface ProduzioneTemplate {
  id: string;
  userId: string;
  nome: string;
  descrizione?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProduzioneTemplateRiga {
  id: string;
  templateId: string;
  prodottoId: string;
  ricettaId: string;
  quantitaPrevista: number;
  unitaMisura: string;
  note?: string;
  userId: string;
  createdAt: string;
}

export interface ProduzioneTemplateIngrediente {
  id: string;
  rigaTemplateId: string;
  ingredienteId: string;
  lottoIngredienteId?: string;
  quantitaPrevista: number;
  userId: string;
}

export interface DatabaseSchema {
  ingredienti: Ingrediente;
  lotti_ingredienti: LottoIngrediente;
  movimenti_magazzino: MovimentoMagazzino;
  prezzi_storico: PrezzoStorico;
  prodotti: Prodotto;
  ricette: Ricette;
  ricetta_ingredienti: RicettaIngrediente;
  lotti_produzione: LottoProduzione;
  lotti_produzione_dettagli: LottoProduzioneDettagli;
  haccp_temperature: HaccpTemperature;
  haccp_pulizie: HaccpPulizie;
  audit_log: AuditLog;
  produzione_templates: ProduzioneTemplate;
  produzione_template_righe: ProduzioneTemplateRiga;
  produzione_template_ingredienti: ProduzioneTemplateIngrediente;
}
