import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";
import { ProgressBreadcrumb } from "./ProgressBreadcrumb";
import { MetricSection } from "./MetricSection";
import { CheckpointModal } from "./CheckpointModal";
import { ChatBar } from "./ChatBar";
import { Id } from "../../convex/_generated/dataModel";

const CATEGORIES = [
  { key: "economic" as const, label: "Economic & Industry Analysis", step: 1 },
  { key: "quantitative" as const, label: "Quantitative Financial Analysis", step: 2 },
  { key: "qualitative" as const, label: "Qualitative Analysis", step: 3 },
  { key: "valuation" as const, label: "Valuation", step: 4 },
];

export function CompanyAnalysis() {
  const [currentStep, setCurrentStep] = useState(1);
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());
  const [isSeeded, setIsSeeded] = useState(false);

  // Seed demo data
  const seedData = useMutation(api.seedData.seedDemoData);
  
  // For demo, we'll use Apple (AAPL)
  const company = useQuery(api.companies.getCompany, { symbol: "AAPL" });
  const progress = useQuery(api.progress.getUserProgress, 
    company ? { companyId: company._id } : "skip"
  );
  const updateProgress = useMutation(api.progress.updateProgress);

  const currentCategory = CATEGORIES.find(cat => cat.step === currentStep);
  const metrics = useQuery(api.companies.getMetricsByCategory, 
    company && currentCategory ? { 
      companyId: company._id, 
      category: currentCategory.key 
    } : "skip"
  );

  const checkpoints = useQuery(api.companies.getCheckpoints,
    company && currentCategory ? {
      companyId: company._id,
      category: currentCategory.key
    } : "skip"
  );

  // Initialize demo data if needed
  useEffect(() => {
    if (!company && !isSeeded) {
      seedData().then(() => setIsSeeded(true));
    }
  }, [company, isSeeded, seedData]);

  // Initialize progress
  useEffect(() => {
    if (progress) {
      setCurrentStep(progress.currentStep);
      setCompletedSections(new Set(CATEGORIES.slice(0, progress.currentStep - 1).map(c => c.step)));
    }
  }, [progress]);

  const handleSectionComplete = async () => {
    if (!company) return;

    // Show checkpoint if available
    if (checkpoints && checkpoints.length > 0) {
      setShowCheckpoint(true);
    } else {
      // No checkpoint, proceed to next step
      await proceedToNextStep();
    }
  };

  const handleCheckpointComplete = async (checkpointId: Id<"checkpoints">) => {
    if (!company) return;
    
    await updateProgress({ 
      companyId: company._id, 
      step: currentStep,
      checkpointId 
    });
    
    setShowCheckpoint(false);
    await proceedToNextStep();
  };

  const proceedToNextStep = async () => {
    if (!company) return;

    setCompletedSections(prev => new Set([...prev, currentStep]));
    
    if (currentStep < 4) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      await updateProgress({ 
        companyId: company._id, 
        step: nextStep 
      });
    }
  };

  const canAccessStep = (step: number) => {
    return step <= (progress?.currentStep || 1);
  };

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Company Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {company.name} ({company.symbol})
            </h1>
            <p className="text-gray-600 mb-4">{company.description}</p>
            <div className="flex gap-6 text-sm text-gray-500">
              <span><strong>Sector:</strong> {company.sector}</span>
              <span><strong>Industry:</strong> {company.industry}</span>
              <span><strong>Market Cap:</strong> ${(company.marketCap / 1e12).toFixed(1)}T</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Breadcrumb */}
      <ProgressBreadcrumb 
        categories={CATEGORIES}
        currentStep={currentStep}
        completedSections={completedSections}
        onStepClick={(step) => canAccessStep(step) && setCurrentStep(step)}
        canAccessStep={canAccessStep}
      />

      {/* Current Section Content */}
      {currentCategory && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">
              {currentCategory.label}
            </h2>
            <p className="text-gray-600 mt-1">
              Step {currentStep} of 4 - {getStepDescription(currentCategory.key)}
            </p>
          </div>

          <div className="p-6">
            {metrics && metrics.length > 0 ? (
              <MetricSection 
                metrics={metrics}
                companyId={company._id}
                onComplete={handleSectionComplete}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>Content for {currentCategory.label} coming soon...</p>
                <button 
                  onClick={handleSectionComplete}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Continue to Next Step
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkpoint Modal */}
      {showCheckpoint && checkpoints && checkpoints.length > 0 && (
        <CheckpointModal
          checkpoint={checkpoints[0]}
          onComplete={handleCheckpointComplete}
          onClose={() => setShowCheckpoint(false)}
        />
      )}

      {/* AI Chat Bar */}
      <ChatBar companyName={company.name} currentSection={currentCategory?.label || ""} />
    </div>
  );
}

function getStepDescription(category: string): string {
  switch (category) {
    case "economic":
      return "Understanding market dynamics and competitive positioning";
    case "quantitative":
      return "Analyzing financial statements and key performance metrics";
    case "qualitative":
      return "Evaluating business model and competitive advantages";
    case "valuation":
      return "Determining intrinsic value and investment thesis";
    default:
      return "";
  }
}
