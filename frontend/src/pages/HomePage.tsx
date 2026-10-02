import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Database, 
  LineChart, 
  Linkedin, 
  Search, 
  ArrowRight, 
  CheckCircle,
  Mail,
  Phone,
  Smartphone,
  Fingerprint,
  Brain,
  Building,
  Users,
  Target,
  MessageSquare,
  Calendar,
  BarChart,
  Globe,
  Share2,
  Clock,
  Filter,
  Crosshair,
  Shield,
  Award,
  Eye,
  Trophy,
  Rocket,
  TrendingUp,
  PieChart,
  Activity
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { MarketingNav } from '../components/marketing/MarketingNav'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinkedin, faTwitter, faFacebook } from '@fortawesome/free-brands-svg-icons'
export function HomePage() {
  const { user, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  
  // ROI Calculator states
  const [leadVolume, setLeadVolume] = useState(100)
  const [conversionRate, setConversionRate] = useState(32)
  const [averageDealValue, setAverageDealValue] = useState(5000)
  const [costPerLead, setCostPerLead] = useState(2.5)
  const [contactRate, setContactRate] = useState(75)
  const [meetingBookedRate, setMeetingBookedRate] = useState(35)
  const [meetingSatRate, setMeetingSatRate] = useState(25)

  // Calculate ROI
  const calculateMonthlyROI = () => {
    const totalLeadCost = leadVolume * costPerLead
    const contactedLeads = Math.floor(leadVolume * (contactRate / 100))
    const meetingsBooked = Math.floor(contactedLeads * (meetingBookedRate / 100))
    const meetingsSat = Math.floor(meetingsBooked * (meetingSatRate / 100))
    const convertedLeads = Math.floor(meetingsSat * (conversionRate / 100))
    const totalRevenue = convertedLeads * averageDealValue
    const roi = totalRevenue - totalLeadCost
    return {
      roi,
      convertedLeads,
      totalRevenue,
      totalLeadCost,
      contactedLeads,
      meetingsBooked,
      meetingsSat
    }
  }

  useEffect(() => {
    // Add smooth scrolling behavior
    document.documentElement.style.scrollBehavior = 'smooth'

    // Clean up
    return () => {
      document.documentElement.style.scrollBehavior = 'auto'
    }
  }, [])

  const scrollToSection = (sectionId: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView()
    }
  }

  const stats = [
    { number: 300, suffix: '%', text: 'Lead Generation Increase' },
    { number: 60, suffix: '%', text: 'Cost Reduction' },
    { number: 95, suffix: '%', text: 'Data Accuracy' },
    { number: 3, suffix: 'x', text: 'ROI Improvement' }
  ]

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 font-sans">
      <MarketingNav />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-0 pt-32">
        <main className="flex-1 space-y-0">
          <section className="w-full py-16 md:py-24 lg:py-32">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="flex flex-col items-center space-y-12 text-center">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <img 
                    src="/images/leadlab-logo.png" 
                    alt="The Lead Lab Logo" 
                    className="h-75 w-auto mb-16"
                  />
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="space-y-6 max-w-4xl"
                >
                  <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl leading-[1.15] pb-1 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 animate-gradient">
                    Connecting Businesses with Qualified Leads
                  </h1>
                  <p className="mx-auto max-w-[800px] text-gray-600 md:text-xl lg:text-2xl leading-relaxed">
                    The Lead Lab combines verified data, psychographic insight, and a practical CRM so your team spends time
                    with prospects who can actually buy — not chasing dead ends.
                  </p>
                </motion.div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 w-full max-w-4xl">
                  {stats.map((stat, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: index * 0.2 }}
                      className="bg-white p-6 rounded-2xl shadow-lg border border-blue-100"
                    >
                      <div className="text-4xl font-bold text-blue-600 mb-2">
                        <CountUp end={stat.number} duration={2.5} />
                        {stat.suffix}
                      </div>
                      <p className="text-gray-600">{stat.text}</p>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.8 }}
                  className="w-full max-w-2xl space-y-4"
                >
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                    <a
                      href="https://calendly.com/joshua-the-leadlab/15min"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center min-w-[240px] px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Calendar className="w-6 h-6 mr-2" />
                      Book a meeting
                    </a>
                    <Link
                      to="/intake"
                      className="inline-flex items-center justify-center min-w-[240px] px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      Tell us what you need
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Link>
                  </div>

                  <p className="text-sm text-gray-500">
                    We will guide you to the right form: business diagnostic, data request, or pitch your idea.
                  </p>

                  {isAuthenticated && (
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
                      <Link
                        to="/dashboard"
                        className="text-center text-sm font-medium text-primary-600 hover:text-primary-700 underline-offset-4 hover:underline"
                      >
                        Open app dashboard
                      </Link>
                      <Link
                        to="/settings/company"
                        className="text-center text-sm font-medium text-primary-600 hover:text-primary-700 underline-offset-4 hover:underline"
                      >
                        Organization &amp; settings
                      </Link>
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </section>

          <section id="about" className="w-full py-16 bg-gradient-to-br from-white via-blue-50/50 to-white">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                  About The-LeadLab.com
                </h2>
                <p className="text-xl text-gray-600 max-w-4xl mx-auto">
                  Welcome to The-LeadLab.com, your premier destination for transforming business growth through intelligent lead generation. We empower companies to connect with high-quality, pre-qualified leads that match your exact target audience. Whether you're a startup looking to establish market presence or an enterprise seeking to expand your customer base, our sophisticated team & platform combines advanced targeting technology with industry expertise to deliver leads that convert.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Target className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Mission</h3>
                  <p className="text-gray-600">
                    Our mission is to empower businesses with AI-driven lead generation tools that reduce customer acquisition costs by up to 60%. We help companies automate lead qualification, enhance contact rates through multi-channel engagement, and optimize sales processes to achieve 3x higher conversion rates while reducing sales department overhead.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Eye className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Vision</h3>
                  <p className="text-gray-600">
                    We envision transforming lead generation through our proprietary AI technology and proven methodologies. By 2025, we aim to help 1000 businesses seamlessly connect with their ideal customers through intelligent matching algorithms, behavioral analytics, and automated nurturing sequences that ensure leads are contacted at the perfect moment.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Shield className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Values</h3>
                  <p className="text-gray-600">
                    At The-LeadLab.com, we're committed to delivering measurable results with complete transparency. Our values include providing 24/7 customer support, maintaining 85% data accuracy, and offering performance-based pricing models. We leverage partnerships with leading big data providers and industry experts to ensure our clients always stay ahead of the competition.
                  </p>
                </motion.div>
              </div>

              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                  The Problems We Solve
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Clock className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Time-Consuming Lead Generation</h3>
                  <p className="text-gray-600">
                    Sales teams waste countless hours manually searching for prospects, cold calling unqualified leads, and updating complex spreadsheets. This drains valuable resources that could be better spent closing deals and growing your business.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Filter className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Inefficient Lead Qualification</h3>
                  <p className="text-gray-600">
                    Without proper qualification processes, your team pursues leads that aren't ready to buy or don't match your ideal customer profile. This results in lower conversion rates and frustrated sales representatives.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Crosshair className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Limited Targeting Options</h3>
                  <p className="text-gray-600">
                    Traditional lead generation relies on broad, unfocused marketing that fails to reach decision-makers in your target market. This scattershot approach wastes your advertising budget and delivers poor-quality leads that rarely convert.
                  </p>
                </motion.div>
              </div>
            </div>
          </section>

          <section className="w-full py-16 bg-white">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                  Why Industry Leaders Choose LeadLab
                </h2>
                <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                  Our platform combines cutting-edge AI technology with proven methodologies to deliver exceptional results
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    icon: <Trophy className="w-12 h-12 text-blue-600" />,
                    title: "Industry-Leading Accuracy",
                    description: "95% data accuracy rate, verified through our multi-step validation process"
                  },
                  {
                    icon: <Rocket className="w-12 h-12 text-blue-600" />,
                    title: "Rapid Implementation",
                    description: "Get started in minutes with our intuitive platform and seamless integration"
                  },
                  {
                    icon: <TrendingUp className="w-12 h-12 text-blue-600" />,
                    title: "Proven ROI",
                    description: "Our clients see an average 300% increase in qualified leads within 3 months"
                  }
                ].map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: index * 0.2 }}
                    className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                  >
                    <div className="bg-white w-20 h-20 rounded-xl flex items-center justify-center mb-6 shadow-md">
                      {feature.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                    <p className="text-gray-600">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="w-full py-16 bg-gradient-to-br from-white via-blue-50/50 to-white" id="services">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                  How LeadLab Works
                </h2>
                <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                  A simple yet powerful process to transform your lead generation
                </p>
              </div>

              <div className="relative">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-blue-200 transform -translate-y-1/2 hidden md:block"></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  {[
                    {
                      icon: <Target className="w-8 h-8 text-blue-600" />,
                      title: "Define Your Ideal Customer",
                      description: "Use our AI-powered profiling tool to create your perfect lead persona"
                    },
                    {
                      icon: <Search className="w-8 h-8 text-blue-600" />,
                      title: "AI-Powered Search",
                      description: "Our algorithms identify and qualify potential leads matching your criteria"
                    },
                    {
                      icon: <Brain className="w-8 h-8 text-blue-600" />,
                      title: "Enrich & Analyze",
                      description: "Add psychometric insights and verify contact information"
                    },
                    {
                      icon: <BarChart className="w-8 h-8 text-blue-600" />,
                      title: "Convert & Scale",
                      description: "Track performance and optimize your approach for better results"
                    }
                  ].map((step, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: index * 0.2 }}
                      className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100 relative z-10"
                    >
                      <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                        {step.icon}
                      </div>
                      <h3 className="text-xl font-bold mb-4">{step.title}</h3>
                      <p className="text-gray-600">{step.description}</p>
                      <div className="absolute top-8 right-8 text-blue-200 font-bold text-4xl">
                        {index + 1}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="w-full py-16 bg-white">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                  Real Results, Real Time
                </h2>
                <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                  Track your success with our comprehensive analytics dashboard
                </p>
              </div>

              <div className="max-w-4xl mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100"
                >
                  <h3 className="text-2xl font-bold mb-6">ROI Calculator</h3>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-gray-600 flex justify-between">
                          <span>Monthly Lead Volume</span>
                          <span className="text-blue-600 font-semibold">{leadVolume} leads</span>
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="1000"
                          step="50"
                          value={leadVolume}
                          onChange={(e) => setLeadVolume(parseInt(e.target.value))}
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>100</span>
                          <span>1000</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-gray-600 flex justify-between">
                          <span>Cost per Lead</span>
                          <span className="text-blue-600 font-semibold">${costPerLead}</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.5"
                          value={costPerLead}
                          onChange={(e) => setCostPerLead(parseFloat(e.target.value))}
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>$1</span>
                          <span>$10</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-gray-600 flex justify-between">
                          <span>Contact Rate</span>
                          <span className="text-blue-600 font-semibold">{contactRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={contactRate}
                          onChange={(e) => setContactRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-gray-600 flex justify-between">
                          <span>Meeting Booked Rate</span>
                          <span className="text-blue-600 font-semibold">{meetingBookedRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={meetingBookedRate}
                          onChange={(e) => setMeetingBookedRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-gray-600 flex justify-between">
                          <span>Meeting Sat Rate</span>
                          <span className="text-blue-600 font-semibold">{meetingSatRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={meetingSatRate}
                          onChange={(e) => setMeetingSatRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-gray-600 flex justify-between">
                          <span>Conversion Rate</span>
                          <span className="text-blue-600 font-semibold">{conversionRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={conversionRate}
                          onChange={(e) => setConversionRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-gray-600 flex justify-between">
                          <span>Average Deal Value</span>
                          <span className="text-blue-600 font-semibold">${averageDealValue}</span>
                        </label>
                        <input
                          type="range"
                          min="1000"
                          max="50000"
                          step="1000"
                          value={averageDealValue}
                          onChange={(e) => setAverageDealValue(parseInt(e.target.value))}
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>$1,000</span>
                          <span>$50,000</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-xl space-y-4">
                      <div className="text-center">
                        <p className="text-gray-600 mb-2">Estimated Monthly ROI</p>
                        <p className="text-4xl font-bold text-blue-600">
                          ${calculateMonthlyROI().roi.toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-blue-100">
                        <div>
                          <p className="text-sm text-gray-600">Total Leads</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {leadVolume} leads
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Contacted Leads</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {calculateMonthlyROI().contactedLeads} leads
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Meetings Booked</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {calculateMonthlyROI().meetingsBooked}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Meetings Sat</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {calculateMonthlyROI().meetingsSat}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Converted Leads</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {calculateMonthlyROI().convertedLeads}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Revenue</p>
                          <p className="text-lg font-semibold text-blue-600">
                            ${calculateMonthlyROI().totalRevenue.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Lead Cost</p>
                          <p className="text-lg font-semibold text-blue-600">
                            ${calculateMonthlyROI().totalLeadCost.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Cost per Lead</p>
                          <p className="text-lg font-semibold text-blue-600">
                            ${costPerLead}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          <section id="features" className="w-full py-16 md:py-24 bg-gradient-to-br from-white via-blue-50/50 to-white">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                Our Unique Approach
              </h2>
              <p className="text-xl text-gray-600 text-center mb-16 max-w-3xl mx-auto">
                Transform your lead generation with our comprehensive suite of tools and services
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  {
                    icon: <Target className="w-8 h-8 text-blue-600" />,
                    title: "Advanced Targeting",
                    description: "AI-powered platform identifies highly qualified leads using precise demographic and behavioral criteria"
                  },
                  {
                    icon: <Brain className="w-8 h-8 text-blue-600" />,
                    title: "Psychometric Profiling",
                    description: "Understand prospect personalities to tailor communication and improve conversion rates"
                  },
                  {
                    icon: <Database className="w-8 h-8 text-blue-600" />,
                    title: "Verified Contact Details",
                    description: "GDPR-compliant network of providers ensuring accurate contact information"
                  },
                  {
                    icon: <Linkedin className="w-8 h-8 text-blue-600" />,
                    title: "LinkedIn Automation",
                    description: "AI-powered conversation flows and personality matching for authentic outreach"
                  },
                  {
                    icon: <Globe className="w-8 h-8 text-blue-600" />,
                    title: "Web Optimization",
                    description: "Comprehensive website development focused on lead capture and conversion"
                  },
                  {
                    icon: <Share2 className="w-8 h-8 text-blue-600" />,
                    title: "Social Media Excellence",
                    description: "Strategic content creation and community management across all platforms"
                  }
                ].map((feature, index) => (
                  <div key={index} className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
                    <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                    <p className="text-gray-600">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="testimonials" className="w-full py-16 md:py-24 bg-gradient-to-br from-white via-blue-50/50 to-white">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                What Our Clients Say
              </h2>
              <p className="text-xl text-gray-600 text-center mb-16 max-w-3xl mx-auto">
                Success stories from industry leaders
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <p className="text-gray-600 italic text-lg mb-6">"The-LeadLab.com revolutionized our approach to lead generation. We experienced a remarkable 300% surge in qualified leads in just three months."</p>
                  <div className="w-12 h-1 bg-blue-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">David Schieder</h4>
                    <p className="text-sm text-gray-600">Senior Wealth Manager, LGT Wealth Management</p>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <p className="text-gray-600 italic text-lg mb-6">"We've achieved 200% growth in sales operations without expanding our team, thanks to their consistently reliable data (95% accuracy)."</p>
                  <div className="w-12 h-1 bg-blue-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">Jacob Lipscombe</h4>
                    <p className="text-sm text-gray-600">Head of Business Development, Anchor Logistics Management</p>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <p className="text-gray-600 italic text-lg mb-6">"We finally stopped wasting time on low-fit leads. Their qualification rules and outreach timing improved our meetings-to-opportunities ratio dramatically."</p>
                  <div className="w-12 h-1 bg-blue-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">Samira Holt</h4>
                    <p className="text-sm text-gray-600">Director of Sales, NorthBridge Technologies</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="pricing" className="w-full py-16 md:py-24 bg-gradient-to-br from-white via-indigo-50/50 to-white">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                Our Products
              </h2>
              <p className="text-xl text-gray-600 text-center mb-16 max-w-3xl mx-auto">
                Choose the solutions that fit your business needs
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { 
                    title: "Qualified Leads", 
                    description: "AI-powered lead identification matching your exact target profile", 
                    price: "$1-4", 
                    unit: "each",
                    icon: <Users className="w-8 h-8 text-blue-600" />
                  },
                  { 
                    title: "Psychometrics", 
                    description: "Detailed personality insights for better engagement", 
                    price: "$2.50", 
                    unit: "each",
                    icon: <Brain className="w-8 h-8 text-blue-600" />
                  },
                  { 
                    title: "Verified Contacts", 
                    description: "GDPR-compliant contact details with accuracy verification", 
                    price: "$1.50", 
                    unit: "each",
                    icon: <Phone className="w-8 h-8 text-blue-600" />
                  },
                  { 
                    title: "Sales Coaching", 
                    description: "Live coaching to optimize your sales process", 
                    price: "$50", 
                    unit: "per hour",
                    icon: <MessageSquare className="w-8 h-8 text-blue-600" />
                  },
                  { 
                    title: "Web Optimization", 
                    description: "Complete website optimization for lead generation", 
                    price: "$300", 
                    unit: "per month",
                    icon: <Globe className="w-8 h-8 text-blue-600" />
                  },
                  {
                    title: "Social Media",
                    description: "Strategic social media management and optimization",
                    price: "$250",
                    unit: "per month",
                    icon: <Share2 className="w-8 h-8 text-blue-600" />
                  }
                ].map((product, index) => (
                  <div key={index} className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
                    <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                      {product.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{product.title}</h3>
                    <p className="text-gray-600 mb-4">{product.description}</p>
                    <p className="text-4xl font-bold mb-1 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                      {product.price}
                    </p>
                    <p className="text-gray-600 mb-6">{product.unit}</p>
                    <button 
                      className="w-full px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-300 shadow-md hover:shadow-lg"
                      onClick={() => {
                        if (isAuthenticated) {
                          navigate('/dashboard/leads');
                        } else {
                          navigate('/signup');
                        }
                      }}
                    >
                      Get Started
                    </button>
                    {product.unit === "per month" && (
                      <p className="text-xs text-gray-500 mt-3">
                        This monthly price renews until you cancel. Cancel before the renewal date to stop the next charge.{" "}
                        <Link to="/legal?policy=terms" className="underline">Terms</Link>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="packages" className="w-full py-16 md:py-24 bg-gradient-to-br from-white via-blue-50/50 to-white">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                Our Packages
              </h2>
              <p className="text-xl text-gray-600 text-center mb-16 max-w-3xl mx-auto">
                Choose the perfect package for your business size and needs
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Users className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Solopreneurs Package</h3>
                  <p className="text-gray-600 mb-6">Launch your business growth with powerful, proven tools.</p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>100 Qualified Leads/Month</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>Free CRM Access</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>100 LinkedIn Profiles</span>
                    </li>
                  </ul>
                  <p className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                    $200
                    <span className="text-lg text-gray-600">/month</span>
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-300 shadow-md hover:shadow-lg"
                    onClick={() => navigate('/signup')}
                  >
                    Get Started
                  </button>
                  <p className="text-xs text-gray-500 mt-3">
                    $200 renews each month until you cancel. Cancel before the renewal date to stop the next charge.{" "}
                    <Link to="/legal?policy=terms" className="underline">Terms</Link>
                  </p>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-blue-200 transform scale-105">
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Building className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">SME Package</h3>
                  <p className="text-gray-600 mb-6">Scale your sales operation with precision and power.</p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>500 Qualified Leads/Month</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>Advanced CRM Features</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>1,000 LinkedIn Profiles</span>
                    </li>
                  </ul>
                  <p className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                    $2,000
                    <span className="text-lg text-gray-600">/month</span>
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-300 shadow-md hover:shadow-lg"
                    onClick={() => navigate('/signup')}
                  >
                    Get Started
                  </button>
                  <p className="text-xs text-gray-500 mt-3">
                    $2,000 renews each month until you cancel. Cancel before the renewal date to stop the next charge.{" "}
                    <Link to="/legal?policy=terms" className="underline">Terms</Link>
                  </p>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Award className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Enterprise Solutions</h3>
                  <p className="text-gray-600 mb-6">Enterprise-grade solutions for market leaders.</p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>Unlimited Qualified Leads</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>Custom API Integration</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>24/7 Priority Support</span>
                    </li>
                  </ul>
                  <p className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                    Custom
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-300 shadow-md hover:shadow-lg"
                    onClick={() => navigate('/contact')}
                  >
                    Contact Sales
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="bg-white py-12 border-t">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div>
                <Link to="/">
                  <img src="/images/leadlab-logo.png" alt="The Lead Lab Logo" className="h-12 w-auto mb-4" />
                </Link>
                <p className="text-gray-600">Transforming lead generation with AI-powered intelligence</p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <ul className="space-y-2">
                  <li><a href="#features" onClick={scrollToSection('features')} className="text-gray-600 hover:text-blue-600">Features</a></li>
                  <li><a href="#pricing" onClick={scrollToSection('pricing')} className="text-gray-600 hover:text-blue-600">Products</a></li>
                  <li><a href="#packages" onClick={scrollToSection('packages')} className="text-gray-600 hover:text-blue-600">Packages</a></li>
                  <li><a href="#testimonials" onClick={scrollToSection('testimonials')} className="text-gray-600 hover:text-blue-600">Testimonials</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="#about"
                      onClick={scrollToSection('about')}
                      className="text-gray-600 hover:text-blue-600"
                    >
                      About
                    </a>
                  </li>
                  <li>
                    <a
                      href="#pricing"
                      onClick={scrollToSection('pricing')}
                      className="text-gray-600 hover:text-blue-600"
                    >
                      Pricing
                    </a>
                  </li>
                  <li>
                    <a
                      href="#services"
                      onClick={scrollToSection('services')}
                      className="text-gray-600 hover:text-blue-600"
                    >
                      Services
                    </a>
                  </li>
                  <li>
                    <Link to="/contact" className="text-gray-600 hover:text-blue-600">
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/data-request" className="text-gray-600 hover:text-blue-600">
                      Data request
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/business-diagnostic" className="text-gray-600 hover:text-blue-600">
                      Business diagnostic
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/pitch-your-idea" className="text-gray-600 hover:text-blue-600">
                      Pitch your idea
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Legal</h4>
                <ul className="space-y-2">
                  <li><Link to="/legal?policy=privacy" className="text-gray-600 hover:text-blue-600">Privacy Policy</Link></li>
                  <li><Link to="/legal?policy=terms" className="text-gray-600 hover:text-blue-600">Terms of Service</Link></li>
                  <li><Link to="/legal?policy=kvkk" className="text-gray-600 hover:text-blue-600">Data Protection Policy Turkiye</Link></li>
                  <li><Link to="/legal?policy=internationalDataProtection" className="text-gray-600 hover:text-blue-600">Data Protection Policy International</Link></li>
                  <li><Link to="/legal?policy=cookie" className="text-gray-600 hover:text-blue-600">Cookie Policy</Link></li>
                  <li><Link to="/legal?policy=dmca" className="text-gray-600 hover:text-blue-600">Copyright / DMCA</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center">
              <p className="text-gray-600">© 2024 The Lead Lab. All rights reserved.</p>
              <div className="flex space-x-6 mt-4 md:mt-0">
                <a href="https://www.linkedin.com/company/the-lead-lab-network/" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-blue-600">
                  <FontAwesomeIcon icon={faLinkedin} size="lg" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
