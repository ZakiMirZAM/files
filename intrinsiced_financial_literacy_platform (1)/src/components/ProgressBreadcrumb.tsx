interface Category {
  key: string;
  label: string;
  step: number;
}

interface ProgressBreadcrumbProps {
  categories: Category[];
  currentStep: number;
  completedSections: Set<number>;
  onStepClick: (step: number) => void;
  canAccessStep: (step: number) => boolean;
}

export function ProgressBreadcrumb({ 
  categories, 
  currentStep, 
  completedSections, 
  onStepClick,
  canAccessStep 
}: ProgressBreadcrumbProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {categories.map((category, index) => (
            <div key={category.key} className="flex items-center">
              <button
                onClick={() => onStepClick(category.step)}
                disabled={!canAccessStep(category.step)}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  category.step === currentStep
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : completedSections.has(category.step)
                    ? "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
                    : canAccessStep(category.step)
                    ? "bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
                    : "bg-gray-50 text-gray-400 cursor-not-allowed"
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                  category.step === currentStep
                    ? "bg-blue-600 text-white"
                    : completedSections.has(category.step)
                    ? "bg-green-600 text-white"
                    : canAccessStep(category.step)
                    ? "bg-gray-300 text-gray-600"
                    : "bg-gray-200 text-gray-400"
                }`}>
                  {completedSections.has(category.step) ? "✓" : category.step}
                </span>
                {category.label}
              </button>
              
              {index < categories.length - 1 && (
                <div className="mx-2 w-8 h-px bg-gray-300"></div>
              )}
            </div>
          ))}
        </div>
        
        <div className="text-sm text-gray-500">
          Step {currentStep} of {categories.length}
        </div>
      </div>
    </div>
  );
}
