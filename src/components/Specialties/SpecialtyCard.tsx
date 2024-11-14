import React from 'react';
import { Users, Stethoscope, Clock, Shield } from 'lucide-react';
import { usePatientStore } from '../../stores/usePatientStore';
import { formatDate } from '../../utils/dateFormat';
import { isLongStay } from '../../utils/stayCalculator';
import LongStayBadge from '../LongStay/LongStayBadge';
import SafetyBadge from '../PatientProfile/SafetyBadge';
import type { Patient } from '../../types/patient';
import type { Consultation } from '../../types/consultation';

interface SpecialtyCardProps {
  specialty: string;
  patients: Patient[];
  consultations: Consultation[];
  onNavigateToPatient: () => void;
}

const SpecialtyCard: React.FC<SpecialtyCardProps> = ({
  specialty,
  patients,
  consultations,
  onNavigateToPatient
}) => {
  const { setSelectedPatient } = usePatientStore();

  const handlePatientClick = (patient: Patient) => {
    setSelectedPatient(patient);
    onNavigateToPatient();
  };

  const handleConsultationClick = (consultation: Consultation) => {
    const admissionDate = new Date(consultation.created_at);
    const dayOfWeek = admissionDate.getDay();
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday

    const admission = {
      id: consultation.id,
      patient_id: consultation.patient_id,
      admitting_doctor_id: consultation.doctor_id || 0,
      status: 'active' as const,
      department: consultation.consultation_specialty,
      admission_date: consultation.created_at,
      discharge_date: null,
      diagnosis: consultation.reason,
      visit_number: 1,
      shift_type: isWeekend ? 'weekend_morning' as const : 'morning' as const,
      is_weekend: isWeekend,
      users: consultation.doctor_name ? { name: consultation.doctor_name } : undefined
    };

    const consultationPatient: Patient = {
      id: consultation.id,
      mrn: consultation.mrn,
      name: consultation.patient_name,
      gender: consultation.gender,
      date_of_birth: new Date(new Date().getFullYear() - consultation.age, 0, 1).toISOString(),
      department: consultation.consultation_specialty,
      doctor_name: consultation.doctor_name,
      diagnosis: consultation.reason,
      admission_date: consultation.created_at,
      admissions: [admission]
    };

    setSelectedPatient(consultationPatient);
    onNavigateToPatient();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{specialty}</h3>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
            {patients.length} patients
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {consultations.length} consultations
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {patients.map((patient) => (
          <div
            key={patient.id}
            onClick={() => handlePatientClick(patient)}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{patient.name}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">MRN: {patient.mrn}</p>
                <div className="flex items-center space-x-2 mt-2">
                  {patient.admissions?.[0]?.safety_type && (
                    <SafetyBadge type={patient.admissions[0].safety_type} />
                  )}
                  {patient.admission_date && isLongStay(patient.admission_date) && (
                    <LongStayBadge admissionDate={patient.admission_date} />
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {formatDate(patient.admission_date || '')}
              </div>
            </div>
          </div>
        ))}

        {consultations.map((consultation) => (
          <div
            key={consultation.id}
            onClick={() => handleConsultationClick(consultation)}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <Stethoscope className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{consultation.patient_name}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">MRN: {consultation.mrn}</p>
                <div className="flex items-center space-x-2 mt-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    consultation.urgency === 'emergency'
                      ? 'bg-red-100 text-red-800'
                      : consultation.urgency === 'urgent'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {consultation.urgency}
                  </span>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {formatDate(consultation.created_at)}
              </div>
            </div>
          </div>
        ))}

        {patients.length === 0 && consultations.length === 0 && (
          <div className="text-center py-6 text-gray-500">
            No active patients or consultations
          </div>
        )}
      </div>
    </div>
  );
};

export default SpecialtyCard;