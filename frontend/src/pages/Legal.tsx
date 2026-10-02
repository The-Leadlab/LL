import React, { useState, useEffect } from 'react';
import { PublicHeader } from '../components/layout/PublicHeader';

export function Legal() {
  const [activePolicy, setActivePolicy] = useState('terms');
  const [isMobile, setIsMobile] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Ekran boyutunu takip etmek için useEffect
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const policies = {
    terms: {
      id: 'terms',
      title: "Terms & Conditions",
      effectiveDate: "01.01.2024",
      content: `Welcome to Lead Lab. By accessing or using our website and services, you agree to comply with and be bound by these Terms and Conditions. If you do not agree with any part of these terms, please refrain from using our services.

1. Definitions
- "Company" refers to Lead Lab, its affiliates, and subsidiaries.
- "Services" refers to the products and services provided by Lead Lab.
- "User" refers to anyone accessing or using the Company’s website or services.
- "Website" refers to www.the-leadlab.com.

2. Use of Services
- Users must be at least 18 years old or have the legal capacity to enter into a contract in their jurisdiction.
- By using the Website or Services, you represent and warrant that your use complies with applicable laws and regulations.
- Unauthorized use of the Website or Services is strictly prohibited.

3. Provision of Services
- Lead Lab reserves the right to modify, suspend, or discontinue any part of the Services at any time without notice.
- Services are provided "as is," and the Company does not guarantee uninterrupted access or error-free performance.

4. Payments and Fees
- All payments must be made in accordance with the pricing and terms specified in the relevant service agreement or on the Website.
- Monthly packages renew at the price shown next to the button until you cancel. Cancel before the renewal date to stop the next charge.
- Late payments may incur additional fees as outlined in the applicable agreement.
- All prices are exclusive of taxes, which are the User’s responsibility unless stated otherwise.

5. Intellectual Property
- All content on the Website, including but not limited to text, graphics, logos, and software, is the intellectual property of Lead Lab or its licensors.
- Users are prohibited from reproducing, distributing, or creating derivative works from any content without explicit permission from Lead Lab.

6. User Responsibilities
- Users must not:
  - Engage in illegal activities while using the Website or Services.
  - Attempt to interfere with the functionality or security of the Website.
  - Share or disclose confidential or proprietary information obtained through the Services.

7. Confidentiality
- Any non-public information exchanged during the provision of Services must remain confidential unless disclosure is required by law.

8. Limitation of Liability
- Lead Lab is not liable for any indirect, incidental, or consequential damages arising from the use of its Services or Website.
- The Company’s total liability for any claim is limited to the amount paid for the Services in question.

9. Data Protection
- Lead Lab processes personal data in compliance with applicable data protection laws and our Data Protection Policy.
- Users consent to the collection, use, and storage of their data as outlined in our Privacy Policy.

10. Third-Party Services
- The Website may contain links to third-party websites or services. Lead Lab is not responsible for the content, terms, or policies of these third-party sites.

11. Termination
- Lead Lab may suspend or terminate a User’s access to the Website or Services at any time for violations of these Terms or other lawful reasons.
- Users may terminate their use of the Services by providing written notice as specified in their service agreement.

12. Governing Law and Jurisdiction
- These Terms are governed by the laws of The Ministry of Justice, - The High Council of Judges and Prosecutors (the HCoJP).
- Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of The Ministry of Justice, - The High Council of Judges and Prosecutors (the HCoJP).

13. Amendments to Terms
- Lead Lab reserves the right to update these Terms at any time. Changes will be posted on this page, and continued use of the Services constitutes acceptance of the revised Terms.

14. Contact Information
For questions about these Terms and Conditions, please contact us.`
    },
    privacy: {
      id: 'privacy',
      title: "Privacy Policy",
      effectiveDate: "01.01.2024",
      content: `At Lead Lab, we are committed to protecting your privacy and ensuring the security of your personal data. This Privacy Policy explains how we collect, use, disclose, and protect the information you provide when using our website, services, and interacting with our business.

1. Information We Collect
We may collect the following types of information:
- Personal Information: Name, email address, phone number, company name, job title, and other details you provide when contacting us or using our services.
- Technical Information: IP address, browser type, operating system, and other details gathered through cookies or similar technologies.
- Transactional Information: Payment details and history related to purchases of our services.

2. How We Use Your Information
We use the information we collect for the following purposes:
- To provide, maintain, and improve our services.
- To process transactions and send you confirmations.
- To respond to inquiries and provide customer support.
- To send marketing communications, updates, or promotional offers (with your consent).
- To comply with legal obligations and enforce our terms of service.

3. Sharing of Information
We do not sell or rent your personal information to third parties. However, we may share your data in the following circumstances:
- Service Providers: With trusted partners who assist in operating our business, such as payment processors or hosting providers, under strict confidentiality agreements.
- Legal Obligations: If required to comply with laws, regulations, or court orders.
- Business Transfers: In connection with a merger, sale, or acquisition of all or part of our business.

4. Data Storage and Security
We implement robust technical and organizational measures to protect your personal data, including:
- Encryption of sensitive data.
- Access controls to limit data exposure to authorized personnel only.
- Regular security assessments to identify and mitigate risks.

5. Your Rights
Depending on your location, you may have the following rights regarding your personal data:
- Access: Request a copy of the personal data we hold about you.
- Correction: Request corrections to incomplete or inaccurate data.
- Deletion: Request the deletion of your personal data (subject to legal and contractual obligations).
- Objection: Object to the processing of your data for specific purposes, such as marketing.
- Data Portability: Request the transfer of your data to another organization.
To exercise your rights, contact us at info@the-leadlab.com.

6. Cookies and Tracking Technologies
Our website uses cookies and similar technologies to improve your browsing experience and analyze website traffic. For more details, please see our Cookie Policy.

7. Data Retention
We retain personal data only as long as necessary to fulfill the purposes outlined in this policy or as required by law. When data is no longer needed, it is securely deleted or anonymized.

8. International Data Transfers
As an international business, your data may be transferred to and processed in countries outside your own. We ensure such transfers comply with applicable data protection laws by implementing appropriate safeguards.

9. Updates to This Privacy Policy
We may update this policy periodically to reflect changes in our practices or legal requirements. Any updates will be posted on this page with an updated "Effective Date."

10. Contact Information
If you have questions or concerns about this Privacy Policy or our data practices, please contact us.`
    },
    kvkk: {
      id: 'kvkk',
      title: "Data Protection Policy Turkiye",
      effectiveDate: "01.01.2024",
      content: `At Lead Lab, we prioritize the protection of personal data entrusted to us by our clients and partners. This policy outlines how we handle personal data in compliance with Turkey’s Law on the Protection of Personal Data (KVKK - Law No. 6698) and other applicable data protection regulations.

1. Purpose of the Policy
This policy ensures the lawful, fair, and secure processing of personal data, reflecting our commitment to privacy and data protection.

2. Scope of the Policy
This policy applies to all personal data processed by Lead Lab, including data from clients and partners outside Turkey.

3. Key Principles of Data Protection
We follow these principles when processing personal data:
- Lawfulness and Fairness
  - Personal data is processed in accordance with KVKK and other applicable laws.
- Purpose Limitation
  - Data is processed only for specified, legitimate purposes communicated to the data subject.
- Data Minimization
  - We collect only the data necessary for the intended purposes.
- Accuracy
  - We strive to keep all personal data accurate and up-to-date.
- Retention Period
  - Data is retained only for as long as necessary to fulfill its purposes or as required by law.
- Data Security
  - Appropriate technical and organizational measures are implemented to protect data from unauthorized access, loss, or destruction.

4. Rights of Data Subjects
Under KVKK, individuals have the right to:
- Learn whether their personal data is processed.
- Request information about data processing activities.
- Request the correction of inaccurate or incomplete data.
- Request the deletion or destruction of personal data under specific conditions.
- Object to the processing of their personal data under certain circumstances.
Data subject requests can be submitted via email to info@the-leadlab.com.

5. Data Security Measures
We ensure personal data is safeguarded through:
- Encryption technologies for data storage and transfer.
- Restricted access to data based on job responsibilities.
- Regular audits of data processing activities.
- Incident response plans to address any potential data breaches.

6. Data Sharing and International Transfers
Lead Lab does not sell data within Turkey. Personal data may be transferred outside Turkey only when:
- The recipient country provides an adequate level of data protection, or
- Specific legal agreements or consent from the data subject have been secured.

7. Data Retention Policy
Personal data is stored only for the duration required to achieve its purpose. Once the retention period has expired, data is securely deleted, destroyed, or anonymized in compliance with KVKK.

8. Updates to This Policy
This policy will be reviewed regularly and updated as needed to reflect changes in Turkish data protection laws or our business operations. The most recent version will be available on our website.

9. Contact Information
For any questions or concerns about this policy or how we handle personal data, please contact us.`
    },
    internationalDataProtection: {
      id: 'internationalDataProtection',
      title: "Data Protection Policy International",
      effectiveDate: "01.01.2024",
      content: `At Lead Lab, we prioritize the privacy and security of personal data entrusted to us by our international clients and partners. This policy outlines how we process, store, and protect personal data in accordance with the applicable data protection laws of the jurisdictions where our clients are located.

1. Purpose of the Policy
This policy ensures the lawful, transparent, and secure processing of personal data, demonstrating Lead Lab's commitment to compliance with international data protection regulations.

2. Scope of the Policy
This policy applies to all personal data processed by Lead Lab as part of its operations. It governs interactions with clients, partners, and users from jurisdictions worldwide, in compliance with their respective data protection laws.

3. Principles of Data Protection
We adhere to the following principles when handling personal data:
1. Lawfulness and Compliance
   - Personal data is processed in line with the applicable data protection laws of the client’s jurisdiction.
2. Purpose Limitation
   - Data is collected for specific, legitimate purposes and is not processed in a way incompatible with these purposes.
3. Data Minimization
   - Only the data necessary for achieving the stated purposes is collected.
4. Accuracy
   - We ensure all personal data is accurate and kept up-to-date.
5. Retention Period
   - Personal data is retained only for the duration required to fulfill its purpose or as required by law.
6. Data Security
   - Appropriate technical and organizational measures are implemented to prevent unauthorized access, disclosure, or loss of personal data.

4. Data Subject Rights
We recognize and respect the rights of data subjects as defined by the laws of their jurisdiction, which may include:
- The right to access and obtain information about their personal data.
- The right to rectify inaccurate or incomplete data.
- The right to request the erasure of data under certain conditions.
- The right to restrict or object to data processing.
- The right to data portability, where applicable.
Data subject requests can be submitted via email to info@the-leadlab.com.

5. Data Security Measures
To ensure the security of personal data, we:
- Employ encryption and secure storage solutions.
- Restrict data access to authorized personnel.
- Regularly audit and update our data protection practices.
- Maintain an incident response plan for addressing potential data breaches.

6. Data Transfers and Sharing
Personal data may be shared with trusted third parties or transferred internationally only when:
- The receiving party complies with adequate data protection standards.
- Legal agreements are in place to ensure the protection of transferred data.
- Data subjects have provided explicit consent, if required.

7. Data Retention Policy
Lead Lab retains personal data only for the period necessary to fulfill the purpose for which it was collected. When data is no longer needed, it is securely deleted, destroyed, or anonymized in compliance with applicable laws.

8. Updates to This Policy
This policy will be reviewed regularly and updated as necessary to reflect changes in international regulations or our business practices. The latest version will always be available on our website.

9. Contact Information
For any questions or concerns about this policy or how we handle personal data, please contact us.`
    },
    cookie: {
      id: 'cookie',
      title: "Cookie Policy",
      effectiveDate: "01.01.2024",
      content: `At Lead Lab, we use cookies to enhance your experience on our website and to better understand how our services are being used. This Cookie Policy explains what cookies are, how we use them, and your rights regarding their use.

1. What Are Cookies?
Cookies are small text files stored on your device when you visit a website. They help the site recognize your device, remember your preferences, and improve your user experience. Cookies may be session-based (temporary) or persistent (stored on your device for a specified period).

2. How We Use Cookies
We use cookies for the following purposes:
• Essential Cookies: To ensure the website functions properly and securely.
• Performance Cookies: To collect information about how visitors use our website, enabling us to improve functionality and content.
• Functionality Cookies: To remember your preferences and settings for a more personalized experience.
• Targeting/Advertising Cookies: To deliver relevant advertisements and measure their effectiveness (if applicable).

3. Third-Party Cookies
We may also allow third-party service providers, such as analytics or advertising networks, to place cookies on your device to help us understand user behavior or deliver targeted content. These third-party cookies are subject to the providers' privacy policies.

4. Managing Cookies
You can control and manage cookies through your browser settings. Most browsers allow you to:
• View what cookies are stored on your device.
• Delete cookies from specific websites or all websites.
• Block cookies from certain sites.
• Disable all cookies entirely.
Please note that disabling cookies may affect the functionality of our website.

5. Updates to This Policy
We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated "Effective Date." We encourage you to review this policy periodically.

6. Contact Us
If you have questions about this Cookie Policy, please contact us.
      `
    },
    dmca: {
      id: 'dmca',
      title: "Copyright / DMCA",
      effectiveDate: "02.10.2026",
      content: `Lead Lab respects copyright. If you believe material on www.the-leadlab.com infringes a copyright you own, email info@the-leadlab.com with:

- Your name and a way to reach you
- The work you believe is infringed
- The URL of the material on this site
- A statement that you have a good-faith belief the use is not authorized
- A statement that the notice is accurate and that you are the owner or authorized to act for the owner
- Your physical or electronic signature

Postal address already published for this service: Elite Park Plaza Floor 5, Umraniye, Istanbul.

A US DMCA designated agent is registered separately. Open the Designated Agent Directory on copyright.gov, enter the service name, this postal address, a phone number, and info@the-leadlab.com, then pay the filing fee (currently 6 US dollars). This page does not submit that filing.

These pages are operational drafts for the product. They are not legal advice. Have a lawyer review them before you rely on them.`
    }
  };

  // Support direct links like `/legal?policy=privacy`
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const policy = params.get('policy')
    if (policy && (policies as any)[policy]) {
      setActivePolicy(policy)
    }
  }, [])

  const NavLink = ({ id, title, isActive, onClick }) => (
    <button
      onClick={() => {
        onClick(id);
        setIsMenuOpen(false);
      }}
      className={`w-full text-left px-4 py-3 text-sm transition-colors duration-200 ${
        isActive
          ? 'text-blue-600 font-semibold border-l-4 border-blue-600' 
          : 'text-gray-700 hover:text-blue-600'
      }`}
      style={{
        backgroundColor: 'transparent', // Arka plan tamamen şeffaf
        boxShadow: 'none' // Gereksiz gölgelendirmeleri kaldır
      }}
    >
      {title}
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <PublicHeader />
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 md:py-12">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Mobil Menüsü */}
          {isMobile && (
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-lg shadow-sm hover:bg-gray-50"
            >
              <span>{policies[activePolicy].title}</span>
              <svg
                className={`w-5 h-5 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Yan Menü */}
          <nav className={`
            md:w-64 flex-shrink-0
            ${isMobile ? 'absolute z-10 w-full px-4 mt-12' : 'relative'}
            ${isMobile && !isMenuOpen ? 'hidden' : 'block'}
          `}>
            <div className="bg-gray-100 rounded-xl p-2 space-y-2">
              {Object.values(policies).map((policy) => (
                <NavLink
                  key={policy.id}
                  id={policy.id}
                  title={policy.title}
                  isActive={activePolicy === policy.id}
                  onClick={setActivePolicy}
                />
              ))}
            </div>
          </nav>

          {/* Ana İçerik */}
          <main className="flex-1 bg-white rounded-2xl shadow-lg p-8 md:p-12">
            <div className="max-w-3xl mx-auto">
              <h1 className="text-4xl font-bold text-gray-900 mb-6">
                {policies[activePolicy].title}
              </h1>
              <p className="text-lg text-gray-500 mb-8">
                Last updated: {policies[activePolicy].effectiveDate}
              </p>
              <div className="prose prose-lg prose-blue max-w-none leading-relaxed space-y-6">
                {policies[activePolicy].content.split('\n').map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
            </div>
          </main>
        </div>

        {/* Footer Bilgisi */}
        <footer className="mt-12 text-center text-gray-500 border-t border-gray-200 pt-8">
          <p className="text-sm mb-2">For any questions about our policies, contact us:</p>
          <a 
            href="mailto:info@the-leadlab.com" 
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            info@the-leadlab.com
          </a>
          <p className="text-sm mt-1">Elite Park Plaza Floor: 5 Umraniye / Istanbul</p>
        </footer>
      </div>
    </div>
  );
}