import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useUserStore } from './useUserStore';
import { useMedicalNotesStore } from './useMedicalNotesStore';
import type { DischargeData } from '../types/discharge';

export interface ActivePatient {
  id: number;
  patient_id: number;
  mrn: string;
  name: string;
  admission_date: string;
  department: string;
  doctor_name: string;
  diagnosis: string;
  status: 'active' | 'discharged' | 'transferred';
  admitting_doctor_id: number;
  shift_type: 'morning' | 'evening' | 'night' | 'weekend_morning' | 'weekend_night';
  is_weekend: boolean;
  isConsultation?: boolean;
  consultation_id?: number;
}

interface DischargeStore {
  activePatients: ActivePatient[];
  loading: boolean;
  error: string | null;
  selectedPatient: ActivePatient | null;
  fetchActivePatients: () => Promise<void>;
  setSelectedPatient: (patient: ActivePatient | null) => void;
  processDischarge: (data: DischargeData) => Promise<void>;
  subscribeToUpdates: () => () => void;
}

export const useDischargeStore = create<DischargeStore>((set, get) => ({
  activePatients: [],
  loading: false,
  error: null,
  selectedPatient: null,

  fetchActivePatients: async () => {
    set({ loading: true, error: null });
    try {
      // Fetch active admissions
      const { data: admissionsData, error: admissionsError } = await supabase
        .from('admissions')
        .select(`
          id,
          patient_id,
          admission_date,
          department,
          diagnosis,
          status,
          admitting_doctor_id,
          shift_type,
          is_weekend,
          patient:patients!admissions_patient_id_fkey (
            mrn,
            name
          ),
          admitting_doctor:users!admissions_admitting_doctor_id_fkey (
            id,
            name,
            medical_code,
            role,
            department
          )
        `)
        .eq('status', 'active');

      if (admissionsError) throw admissionsError;

      // Fetch active consultations
      const { data: consultationsData, error: consultationsError } = await supabase
        .from('consultations')
        .select(`
          id,
          patient_id,
          mrn,
          patient_name,
          created_at,
          consultation_specialty,
          reason,
          doctor_id,
          doctor_name,
          status
        `)
        .eq('status', 'active');

      if (consultationsError) throw consultationsError;

      // Format admissions data
      const admissionPatients = (admissionsData || []).map(admission => ({
        id: admission.id,
        patient_id: admission.patient_id,
        mrn: admission.patient[0]?.mrn || '',
        name: admission.patient[0]?.name || '',
        admission_date: admission.admission_date,
        department: admission.department,
        doctor_name: admission.admitting_doctor?.[0]?.name || 'Not assigned',
        diagnosis: admission.diagnosis,
        status: admission.status,
        admitting_doctor_id: admission.admitting_doctor_id,
        shift_type: admission.shift_type,
        is_weekend: admission.is_weekend
      }));

      // Format consultations data
      const consultationPatients = (consultationsData || []).map(consultation => ({
        id: consultation.id,
        patient_id: consultation.patient_id,
        mrn: consultation.mrn,
        name: consultation.patient_name,
        admission_date: consultation.created_at,
        department: consultation.consultation_specialty,
        doctor_name: consultation.doctor_name || 'Pending Assignment',
        diagnosis: consultation.reason,
        status: 'active' as const,
        admitting_doctor_id: consultation.doctor_id || 0,
        shift_type: 'morning' as const,
        is_weekend: false,
        isConsultation: true,
        consultation_id: consultation.id
      }));

      const allPatients = [...admissionPatients, ...consultationPatients];

      // Update selected patient if it exists
      const selectedPatient = get().selectedPatient;
      if (selectedPatient) {
        const updatedPatient = allPatients.find(p => p.id === selectedPatient.id);
        if (!updatedPatient) {
          set({ selectedPatient: null });
        } else {
          set({ selectedPatient: updatedPatient });
        }
      }

      set({ activePatients: allPatients, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred', 
        loading: false 
      });
    }
  },

  setSelectedPatient: (patient) => {
    set({ selectedPatient: patient });
  },

  processDischarge: async (data) => {
    set({ loading: true, error: null });
    try {
      const selectedPatient = get().selectedPatient;
      const currentUser = useUserStore.getState().currentUser;

      if (!selectedPatient) throw new Error('No patient selected');
      if (!currentUser) throw new Error('No user logged in');

      if (selectedPatient.isConsultation) {
        // Complete consultation
        const { error: consultationError } = await supabase
          .from('consultations')
          .update({
            status: 'completed',
            completion_note: data.discharge_note,
            completed_by: currentUser.id,
            completed_at: new Date().toISOString()
          })
          .eq('id', selectedPatient.consultation_id);

        if (consultationError) throw consultationError;

        // Add consultation note
        await useMedicalNotesStore.getState().addNote({
          patient_id: selectedPatient.patient_id,
          doctor_id: currentUser.id,
          note_type: 'Consultation Note',
          content: data.discharge_note
        });
      } else {
        // Process discharge for regular admission
        const { error: updateError } = await supabase
          .from('admissions')
          .update({
            status: 'discharged',
            discharge_date: data.discharge_date,
            discharge_type: data.discharge_type,
            follow_up_required: data.follow_up_required,
            follow_up_date: data.follow_up_date || null,
            discharge_note: data.discharge_note,
            discharge_doctor_id: currentUser.id
          })
          .eq('id', selectedPatient.id);

        if (updateError) throw updateError;

        // Add discharge summary note
        await useMedicalNotesStore.getState().addNote({
          patient_id: selectedPatient.patient_id,
          doctor_id: currentUser.id,
          note_type: 'Discharge Summary',
          content: data.discharge_note
        });
      }

      // Refresh active patients list
      await get().fetchActivePatients();
      
      // Clear selected patient
      set({ selectedPatient: null, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred', 
        loading: false 
      });
      throw error;
    }
  },

  subscribeToUpdates: () => {
    const subscription = supabase
      .channel('discharge-updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'admissions' 
      }, () => {
        get().fetchActivePatients();
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'consultations' 
      }, () => {
        get().fetchActivePatients();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }
}));