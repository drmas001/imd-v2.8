import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Patient } from '../types/patient';

interface PatientStore {
  patients: Patient[];
  selectedPatient: Patient | null;
  loading: boolean;
  error: string | null;
  fetchPatients: (includeAllDischarged?: boolean) => Promise<void>;
  addPatient: (patientData: any) => Promise<void>;
  updatePatient: (id: number, updates: Partial<Patient>) => Promise<void>;
  deletePatient: (id: number) => Promise<void>;
  setSelectedPatient: (patient: Patient | null) => void;
}

export const usePatientStore = create<PatientStore>((set, get) => ({
  patients: [],
  selectedPatient: null,
  loading: false,
  error: null,

  setSelectedPatient: (patient) => {
    set({ selectedPatient: patient });
  },

  fetchPatients: async (includeAllDischarged = false) => {
    set({ loading: true, error: null });
    try {
      let query = supabase
        .from('patients')
        .select(`
          id,
          mrn,
          name,
          date_of_birth,
          gender,
          created_at,
          updated_at,
          admissions!admissions_patient_id_fkey (
            id,
            patient_id,
            admitting_doctor_id,
            admission_date,
            discharge_date,
            department,
            diagnosis,
            status,
            visit_number,
            safety_type,
            shift_type,
            is_weekend,
            admitting_doctor:users!admissions_admitting_doctor_id_fkey (
              id,
              name,
              medical_code,
              role,
              department
            ),
            discharge_doctor:users!admissions_discharge_doctor_id_fkey (
              id,
              name,
              medical_code,
              role,
              department
            )
          )
        `);

      if (!includeAllDischarged) {
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - 18);

        query = query
          .not('admissions', 'is', null)
          .or(`status.eq.active,and(status.eq.discharged,discharge_date.gte.${cutoffTime.toISOString()})`, { 
            foreignTable: 'admissions' 
          });
      }

      const { data, error } = await query;

      if (error) throw error;

      const patientsWithDetails = data?.map(patient => {
        const admissions = (patient.admissions || [])
          .sort((a, b) => new Date(b.admission_date).getTime() - new Date(a.admission_date).getTime())
          .map(admission => ({
            id: admission.id,
            patient_id: admission.patient_id,
            admitting_doctor_id: admission.admitting_doctor_id,
            admission_date: admission.admission_date,
            discharge_date: admission.discharge_date,
            department: admission.department,
            diagnosis: admission.diagnosis,
            status: admission.status,
            visit_number: admission.visit_number,
            safety_type: admission.safety_type,
            shift_type: admission.shift_type,
            is_weekend: admission.is_weekend,
            admitting_doctor: admission.admitting_doctor?.[0],
            discharge_doctor: admission.discharge_doctor?.[0]
          }));

        const activeAdmission = admissions.find(a => a.status === 'active');
        const latestAdmission = admissions[0];

        return {
          id: patient.id,
          mrn: patient.mrn,
          name: patient.name,
          date_of_birth: patient.date_of_birth,
          gender: patient.gender,
          admissions,
          department: activeAdmission?.department || latestAdmission?.department,
          diagnosis: activeAdmission?.diagnosis || latestAdmission?.diagnosis,
          admission_date: activeAdmission?.admission_date || latestAdmission?.admission_date,
          doctor_name: activeAdmission?.admitting_doctor?.name || latestAdmission?.admitting_doctor?.name
        };
      }) || [];

      set({ patients: patientsWithDetails });

      const selectedPatient = get().selectedPatient;
      if (selectedPatient) {
        const updatedPatient = patientsWithDetails.find(p => p.id === selectedPatient.id);
        if (updatedPatient) {
          set({ selectedPatient: updatedPatient });
        }
      }

      set({ loading: false });
    } catch (error) {
      console.error('Error fetching patients:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch patients', 
        loading: false 
      });
    }
  },

  addPatient: async (patientData) => {
    set({ loading: true, error: null });
    try {
      const { data: patientResult, error: patientError } = await supabase
        .from('patients')
        .insert({
          mrn: patientData.mrn,
          name: patientData.name,
          date_of_birth: patientData.date_of_birth,
          gender: patientData.gender
        })
        .select()
        .single();

      if (patientError) throw patientError;

      const { data: admissionResult, error: admissionError } = await supabase
        .from('admissions')
        .insert({
          patient_id: patientResult.id,
          admitting_doctor_id: patientData.admission.admitting_doctor_id,
          admission_date: patientData.admission.admission_date,
          department: patientData.admission.department,
          diagnosis: patientData.admission.diagnosis,
          status: 'active',
          safety_type: patientData.admission.safety_type,
          shift_type: patientData.admission.shift_type,
          is_weekend: patientData.admission.is_weekend,
          visit_number: 1
        })
        .select(`
          *,
          admitting_doctor:users!admissions_admitting_doctor_id_fkey (
            id,
            name,
            medical_code,
            role,
            department
          )
        `)
        .single();

      if (admissionError) throw admissionError;

      await get().fetchPatients();

      set({ loading: false });
    } catch (error) {
      console.error('Error adding patient:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to add patient', 
        loading: false 
      });
      throw error;
    }
  },

  updatePatient: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        patients: state.patients.map(p => p.id === id ? { ...p, ...updates } : p),
        selectedPatient: state.selectedPatient?.id === id ? { ...state.selectedPatient, ...updates } : state.selectedPatient,
        loading: false
      }));
    } catch (error) {
      console.error('Error updating patient:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update patient', 
        loading: false 
      });
      throw error;
    }
  },

  deletePatient: async (id) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        patients: state.patients.filter(p => p.id !== id),
        selectedPatient: state.selectedPatient?.id === id ? null : state.selectedPatient,
        loading: false
      }));
    } catch (error) {
      console.error('Error deleting patient:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete patient', 
        loading: false 
      });
      throw error;
    }
  }
}));