import React, { useState, useEffect } from 'react';
import { Calendar, Search, FileText, AlertCircle } from 'lucide-react';
import { useDischargeStore } from '../../stores/useDischargeStore';
import { useUserStore } from '../../stores/useUserStore';
import { useNavigate } from '../../hooks/useNavigate';
import { formatDate } from '../../utils/dateFormat';
import type { DischargeData } from '../../types/discharge';

interface FormData {
  discharge_date: string;
  discharge_type: 'regular' | 'against-medical-advice' | 'transfer';
  follow_up_required: boolean;
  follow_up_date: string;
  discharge_note: string;
}

const initialFormData: FormData = {
  discharge_date: new Date().toISOString().split('T')[0],
  discharge_type: 'regular',
  follow_up_required: false,
  follow_up_date: new Date().toISOString().split('T')[0],
  discharge_note: ''
};

const DischargeForm: React.FC = () => {
  const { currentUser } = useUserStore();
  const { goBack } = useNavigate();
  const { 
    activePatients, 
    loading, 
    error, 
    selectedPatient, 
    fetchActivePatients,
    setSelectedPatient, 
    processDischarge,
    subscribeToUpdates
  } = useDischargeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Initial fetch
    fetchActivePatients();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToUpdates();

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, [fetchActivePatients, subscribeToUpdates]);

  const filteredPatients = activePatients.filter(patient => 
    patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    patient.mrn.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.discharge_date) {
      errors.discharge_date = 'Discharge date is required';
    }

    if (formData.follow_up_required && !formData.follow_up_date) {
      errors.follow_up_date = 'Follow-up date is required when follow-up is enabled';
    }

    if (formData.follow_up_required && 
        new Date(formData.follow_up_date) <= new Date(formData.discharge_date)) {
      errors.follow_up_date = 'Follow-up date must be after discharge date';
    }

    if (!formData.discharge_note.trim()) {
      errors.discharge_note = 'Discharge note is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      setFormErrors({ discharge_note: 'You must be logged in to process a discharge' });
      return;
    }

    if (!selectedPatient) {
      setFormErrors({ discharge_note: 'Please select a patient' });
      return;
    }

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const dischargeData: DischargeData = {
        ...formData,
        follow_up_date: formData.follow_up_required ? formData.follow_up_date : undefined,
        status: 'discharged'
      };

      await processDischarge(dischargeData);
      goBack();
    } catch (err) {
      setFormErrors(prev => ({
        ...prev,
        discharge_note: err instanceof Error ? err.message : 'Error processing discharge'
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
    setFormErrors(prev => ({ ...prev, [name]: undefined }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center space-x-2">
        <AlertCircle className="h-5 w-5" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by patient name or MRN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
          />
        </div>

        <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
          {filteredPatients.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => setSelectedPatient(patient)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedPatient?.id === patient.id
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'hover:bg-gray-50 border-gray-200'
              } border`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900">{patient.name}</p>
                  <p className="text-sm text-gray-600">MRN: {patient.mrn}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm text-gray-500">
                    {formatDate(patient.admission_date)}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    patient.isConsultation
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {patient.isConsultation ? 'Consultation' : 'Inpatient'}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-1">{patient.department}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="discharge_date" className="block text-sm font-medium text-gray-700 mb-1">
            {selectedPatient?.isConsultation ? 'Completion Date' : 'Discharge Date'}
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="date"
              id="discharge_date"
              name="discharge_date"
              value={formData.discharge_date}
              onChange={handleChange}
              className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                formErrors.discharge_date ? 'border-red-300' : 'border-gray-300'
              } focus:ring-2 focus:ring-indigo-600 focus:border-transparent`}
              required
            />
          </div>
          {formErrors.discharge_date && (
            <p className="mt-1 text-sm text-red-600">{formErrors.discharge_date}</p>
          )}
        </div>

        {!selectedPatient?.isConsultation && (
          <div>
            <label htmlFor="discharge_type" className="block text-sm font-medium text-gray-700 mb-1">
              Discharge Type
            </label>
            <select
              id="discharge_type"
              name="discharge_type"
              value={formData.discharge_type}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              required
            >
              <option value="regular">Regular Discharge</option>
              <option value="against-medical-advice">Against Medical Advice</option>
              <option value="transfer">Transfer to Another Facility</option>
            </select>
          </div>
        )}

        <div>
          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              id="follow_up_required"
              name="follow_up_required"
              checked={formData.follow_up_required}
              onChange={handleChange}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="follow_up_required" className="ml-2 block text-sm text-gray-700">
              Follow-up Required
            </label>
          </div>
          {formData.follow_up_required && (
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="date"
                id="follow_up_date"
                name="follow_up_date"
                value={formData.follow_up_date}
                onChange={handleChange}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  formErrors.follow_up_date ? 'border-red-300' : 'border-gray-300'
                } focus:ring-2 focus:ring-indigo-600 focus:border-transparent`}
                required={formData.follow_up_required}
              />
            </div>
          )}
          {formErrors.follow_up_date && (
            <p className="mt-1 text-sm text-red-600">{formErrors.follow_up_date}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="discharge_note" className="block text-sm font-medium text-gray-700 mb-1">
          {selectedPatient?.isConsultation ? 'Completion Note' : 'Discharge Note'}
        </label>
        <div className="relative">
          <FileText className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <textarea
            id="discharge_note"
            name="discharge_note"
            value={formData.discharge_note}
            onChange={handleChange}
            rows={6}
            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
              formErrors.discharge_note ? 'border-red-300' : 'border-gray-300'
            } focus:ring-2 focus:ring-indigo-600 focus:border-transparent`}
            required
          />
        </div>
        {formErrors.discharge_note && (
          <p className="mt-1 text-sm text-red-600">{formErrors.discharge_note}</p>
        )}
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={goBack}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <span>{selectedPatient?.isConsultation ? 'Complete Consultation' : 'Process Discharge'}</span>
          )}
        </button>
      </div>
    </form>
  );
};

export default DischargeForm;