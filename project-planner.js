const planner = document.querySelector('#project-planner');

if (planner) {
    const steps = [...planner.querySelectorAll('[data-planner-step]')];
    const progressItems = [...document.querySelectorAll('[data-planner-progress]')];
    const result = planner.querySelector('#planner-result');
    const recommendation = planner.querySelector('#planner-recommendation');
    const status = planner.querySelector('#planner-status');
    const copyButton = planner.querySelector('#planner-copy');
    const inquiryButton = planner.querySelector('#planner-inquiry');
    const serviceTargets = {
        'Website or web application': 'Website or web application',
        'Android app design and development': 'Android app design and development',
        'Custom software and programming': 'Custom software and programming',
        'UI/UX design and prototype': 'UI/UX design and prototype',
        'APIs and integrations': 'APIs and integrations',
        'Automation and ongoing support': 'Automation and ongoing support',
        Other: 'Other'
    };
    const packageRecommendations = {
        'Website or web application': {
            title: 'A likely starting point: Website or app MVP',
            description: 'Your idea points toward a digital product build. A short discovery phase can clarify features and integrations before the build scope is quoted.',
            package: 'Web or app build'
        },
        'Android app design and development': {
            title: 'A likely starting point: Product discovery or an app MVP',
            description: 'Start by confirming the core user flows and Android-specific needs. The right first engagement may be discovery, design, or a scoped app build.',
            package: 'Product discovery'
        },
        'Custom software and programming': {
            title: 'A likely starting point: Product discovery',
            description: 'Internal tools often depend on existing workflows and data. Map those needs first, then define a focused first release.',
            package: 'Product discovery'
        },
        'UI/UX design and prototype': {
            title: 'A likely starting point: Design & prototype',
            description: 'A clickable prototype can help align stakeholders and test the experience before committing to development.',
            package: 'Design & prototype'
        },
        'APIs and integrations': {
            title: 'A likely starting point: Product discovery',
            description: 'The integration scope depends on the systems, permissions, data, and failure handling involved. Identify those dependencies before estimating the work.',
            package: 'Product discovery'
        },
        'Automation and ongoing support': {
            title: 'A likely starting point: Ongoing care or workflow discovery',
            description: 'For an existing product, first review the current system, priorities, and access needs before agreeing support or automation work.',
            package: 'Ongoing care'
        },
        Other: {
            title: 'A likely starting point: Product discovery',
            description: 'If the right solution is not clear yet, begin with the problem and define a small, practical next step together.',
            package: 'Product discovery'
        }
    };

    let currentStep = 0;

    function setStep(index) {
        currentStep = index;
        steps.forEach((step, stepIndex) => {
            step.hidden = stepIndex !== index;
        });
        progressItems.forEach((item, itemIndex) => {
            item.classList.toggle('is-current', itemIndex === index);
            item.classList.toggle('is-complete', itemIndex < index);
            if (itemIndex === index) {
                item.setAttribute('aria-current', 'step');
            } else {
                item.removeAttribute('aria-current');
            }
        });
        const heading = steps[index].querySelector('h3');
        heading.focus({ preventScroll: true });
    }

    function setStatus(message, kind = '') {
        status.textContent = message;
        status.dataset.kind = kind;
    }

    function formValue(name) {
        return planner.elements[name].value.trim();
    }

    function selectedFeatures() {
        return [...planner.querySelectorAll('input[name="features"]:checked')]
            .map((input) => input.value);
    }

    function makeBrief() {
        const service = formValue('service');
        const goal = formValue('goal');
        const audience = formValue('audience');
        const features = selectedFeatures();
        const existing = formValue('existing');
        const timeline = formValue('timeline') || 'Not sure yet';
        const budget = formValue('budget');
        const lines = [
            'PROJECT BRIEF - INITIAL DISCUSSION',
            '',
            `Project type: ${service}`,
            `Problem or goal: ${goal}`,
            `Intended users: ${audience || 'To be clarified'}`,
            `Possible first-version capabilities: ${features.length ? features.join('; ') : 'To be explored'}`,
            `Existing system: ${existing}`,
            `Ideal start: ${timeline}`,
            `Budget or constraints: ${budget || 'Not specified'}`,
            '',
            'Open questions: What is the smallest useful first release? Which systems, content, or approvals does it depend on? What should success look like?',
            '',
            'This is an early discussion brief, not a final specification, quote, or delivery commitment.'
        ];

        return lines.join('\n');
    }

    function showRecommendation() {
        const suggestion = packageRecommendations[formValue('service')] ?? packageRecommendations.Other;
        recommendation.replaceChildren();

        const eyebrow = document.createElement('span');
        eyebrow.textContent = suggestion.package;
        const heading = document.createElement('h4');
        heading.textContent = suggestion.title;
        const description = document.createElement('p');
        description.textContent = suggestion.description;
        recommendation.append(eyebrow, heading, description);
    }

    planner.addEventListener('click', (event) => {
        const nextButton = event.target.closest('.planner-next');
        const backButton = event.target.closest('.planner-back');

        if (nextButton) {
            if (currentStep === 0) {
                const service = planner.elements.service;
                const goal = planner.elements.goal;
                if (!service.reportValidity() || !goal.reportValidity()) {
                    return;
                }
                setStep(1);
                return;
            }

            if (currentStep === 1) {
                result.value = makeBrief();
                showRecommendation();
                setStatus('');
                setStep(2);
            }
        }

        if (backButton) {
            setStep(Math.max(0, currentStep - 1));
        }
    });

    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(result.value);
            setStatus('Brief copied. It has not been sent to Desalu Engineering.');
        } catch (error) {
            console.error('Could not copy the project brief.', error);
            result.focus();
            result.select();
            setStatus('Automatic copy is unavailable. The brief is selected so you can copy it manually.', 'error');
        }
    });

    inquiryButton.addEventListener('click', () => {
        const inquiryForm = document.querySelector('#project-inquiry');
        const inquiryService = inquiryForm?.elements.service;
        const inquiryMessage = inquiryForm?.elements.message;
        const inquiryTimeline = inquiryForm?.elements.timeline;

        if (!inquiryForm || !inquiryService || !inquiryMessage || !inquiryTimeline) {
            setStatus('The inquiry form is unavailable. Copy your brief and contact us another way.', 'error');
            return;
        }

        inquiryService.value = serviceTargets[formValue('service')] ?? 'other';
        inquiryMessage.value = result.value;
        inquiryMessage.focus();

        const timelineValue = formValue('timeline');
        const allowedTimelines = [...inquiryTimeline.options].map((option) => option.value);
        inquiryTimeline.value = allowedTimelines.includes(timelineValue) ? timelineValue : '';

        setStatus('Brief added to the inquiry form. Review it, then add your name and email to send it.');
        document.querySelector('#contact').scrollIntoView({ behavior: 'smooth' });
    });

    const pendingBrief = sessionStorage.getItem('desalu-pending-project-brief');
    if (pendingBrief) {
        try {
            const draft = JSON.parse(pendingBrief);
            if (typeof draft.content === 'string' && typeof draft.service === 'string') {
                result.value = draft.content;
                showRecommendation();
                setStep(2);
                setStatus('Your brief is ready to save to your workspace.');
            } else {
                throw new Error('The saved brief draft is incomplete.');
            }
        } catch (error) {
            console.error('Could not restore the pending project brief.', error);
            sessionStorage.removeItem('desalu-pending-project-brief');
            setStatus('The pending brief could not be restored. Please create it again.', 'error');
        }
    }
}
