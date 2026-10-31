import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsAPI, usersAPI, tagsAPI, Lead } from '@/services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Label } from '../../components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover';
import { Search, ChevronsUpDown, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../store/auth';


interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
  organization_id: number;
  organization_role: string;
  company?: string;
  job_title?: string;
  role?: string;
}

interface Tag {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string | null;
  organization_id?: number;
}



export function LeadManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [selectedUsers, setSelectedUsers] = React.useState<string[]>([]);
  const [selectedTag, setSelectedTag] = React.useState<string>('');
  const [newTagName, setNewTagName] = React.useState<string>('');
  const [createNewTag, setCreateNewTag] = React.useState<boolean>(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [open, setOpen] = React.useState(false);

  // Fetch users for assignment - admin users get all users, regular users get organization users
  const { data: users = [], isLoading: isUsersLoading } = useQuery<User[]>({
    queryKey: user?.is_admin ? ['all-users'] : ['organization-users'],
    queryFn: async () => {
      try {
        let response;
        
        if (user?.is_admin) {
          // Admin users can see all users across all organizations
          response = await usersAPI.getAll();
          const allUsers = response.data?.items || response.data || [];
          return allUsers.map(user => ({
            ...user,
            full_name: `${user.first_name} ${user.last_name}`.trim(),
            role: user.is_admin ? 'admin' : user.organization_role || 'member'
          }));
        } else {
          // Regular users only see their organization users
          response = await usersAPI.getOrganizationUsers();
          return (response.data || []).map(user => ({
            ...user,
            full_name: `${user.first_name} ${user.last_name}`.trim(),
            role: user.is_admin ? 'admin' : user.organization_role || 'member'
          }));
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        return [];
      }
    },
    enabled: !!user, // Only run query when user is available
  });

  // Fetch tags for assignment
  const { data: tags = [], isLoading: isTagsLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      try {
        const response = await tagsAPI.getAll();
        // The backend API returns the tags directly as an array, not wrapped in an 'items' property
        return response.data || [];
      } catch (error) {
        console.error('Error fetching tags:', error);
        return [];
      }
    },
  });

  const importLeadsMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return leadsAPI.uploadCSV(formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelectedFile(null);
      setSelectedUsers([]);
      setSelectedTag('');
      toast.success('Leads imported successfully');
    },
    onError: () => {
      toast.error('Failed to import leads');
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      // For now, we only support assigning to one user
      if (selectedUsers.length > 0) {
        formData.append('assigned_user_id', selectedUsers[0]);
      } else {
        toast.error('Please select a user to assign leads to');
        return;
      }
      
      // Add tag if selected or create new tag
      if (createNewTag && newTagName.trim()) {
        formData.append('new_tag_name', newTagName.trim());
      } else if (selectedTag && selectedTag !== 'none') {
        formData.append('tag_id', selectedTag);
      }
      
      try {
        await importLeadsMutation.mutateAsync(formData);
      } catch (error) {
        console.error('Import failed:', error);
        toast.error('Failed to import leads');
      }
    }
  };

  const handleUserSelection = (userId: string) => {
    setSelectedUsers([userId]); // Only allow one user
  };

  // Filter users based on search term
  const filteredUsers = React.useMemo(() => {
    if (!searchTerm) return users;
    
    const searchLower = searchTerm.toLowerCase();
    return users.filter(user => 
      user.first_name.toLowerCase().includes(searchLower) ||
      user.last_name.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.company && user.company.toLowerCase().includes(searchLower))
    );
  }, [users, searchTerm]);

  if (isUsersLoading || isTagsLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Leads</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Assign Leads to User</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>CSV File</Label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                />
              </div>

              <div>
                <Label>Select User to Assign Leads</Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-full justify-between"
                    >
                      {selectedUsers.length > 0
                        ? `${users.find(u => u.id.toString() === selectedUsers[0])?.first_name || ''} ${users.find(u => u.id.toString() === selectedUsers[0])?.last_name || ''}`
                        : "Select user..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <div className="flex flex-col">
                      <div className="flex items-center border-b px-3 pb-2">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <Input
                          placeholder="Search users by name, email or company..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="border-0 focus-visible:ring-0"
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {filteredUsers.map(user => (
                          <div
                            key={user.id}
                            className="flex items-center gap-3 p-2 hover:bg-accent cursor-pointer border-b last:border-b-0"
                            onClick={() => {
                              handleUserSelection(user.id.toString());
                              setOpen(false);
                            }}
                          >
                            <input
                              type="radio"
                              checked={selectedUsers.includes(user.id.toString())}
                              onChange={() => {}}
                              className="h-4 w-4"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{user.first_name} {user.last_name}</span>
                                {user.role === 'admin' && (
                                  <Badge variant="secondary" className="text-xs">
                                    Admin
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <div>{user.email}</div>
                                {user.company && <div>{user.company}</div>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="createNewTag" 
                    checked={createNewTag}
                    onChange={(e) => {
                      setCreateNewTag(e.target.checked);
                      if (e.target.checked) {
                        setSelectedTag('');
                      }
                    }}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="createNewTag">Create a new tag</Label>
                </div>
                
                {createNewTag ? (
                  <div className="space-y-4">
                    <div>
                      <Label>New Tag Name</Label>
                      <Input 
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Enter tag name"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label>Select Existing Tag (Optional)</Label>
                    <Select 
                      value={selectedTag} 
                      onValueChange={setSelectedTag}
                      disabled={createNewTag}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a tag" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px] overflow-y-auto w-[var(--radix-select-trigger-width)]" position="popper">
                        <SelectItem value="none">No tag</SelectItem>
                        {Array.isArray(tags) && tags.map((tag: Tag) => (
                          <SelectItem key={tag.id} value={tag.id.toString()}>
                            {tag.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handleImport}
                disabled={!selectedFile || selectedUsers.length === 0 || importLeadsMutation.isLoading || (createNewTag && !newTagName)}
              >
                {importLeadsMutation.isLoading ? 'Importing...' : 'Import Leads'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CSV Format Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Your CSV file should include the following columns:
            </p>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Required Fields:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>first_name</li>
                    <li>last_name</li>
                    <li>company</li>
                    <li>job_title</li>
                    <li>location or country</li>
                    <li>linkedi or website</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Optional Fields:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>email</li>
                    <li>telephone</li>
                    <li>mobile</li>
                    <li>sector</li>
                    <li>unique_lead_id</li>
                    <li>time_in_current_role</li>
                    <li>lab_comments</li>
                    <li>client_comments</li>
                    <li>psychometrics</li>
                    <li>wpi</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="font-medium mb-2">File Requirements:</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Use comma (,) as the delimiter</li>
                  <li>Include headers in the first row</li>
                  <li>All required fields must be present</li>
                  <li>Save the file in UTF-8 encoding</li>
                  <li>Maximum file size: 10MB</li>
                </ul>
              </div>

              <a
                href="/template.csv"
                download
                className="text-sm inline-flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
                Download Template CSV
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
